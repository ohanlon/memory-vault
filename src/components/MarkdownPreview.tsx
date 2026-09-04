import { useCallback, useEffect, useMemo, useState, MouseEvent } from "react";
import { Marked, type Tokens } from "marked";
import DOMPurify from "dompurify";
import { EXTERNAL_SCHEME_RE, titleFromHref } from "../editor/livePreview";
import { ensureLanguagesLoaded, extractNeededLanguageIds, highlightCode } from "../editor/codeHighlight";

interface Props {
  content: string;
  noteTitles: Set<string>;
  onSelectTitle: (title: string) => void;
  onOpenExternal: (url: string) => void;
  enabledCodeLanguages: string[];
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function createMarked(noteTitles: Set<string>, enabledLanguageIds: ReadonlySet<string>) {
  return new Marked({
    renderer: {
      code({ text, lang }: Tokens.Code) {
        const content = text.replace(/\n$/, "") + "\n";
        const highlighted = highlightCode(content, lang, enabledLanguageIds);
        if (highlighted) {
          return `<pre><code class="hljs language-${escapeHtml(highlighted.language)}">${highlighted.html}</code></pre>\n`;
        }
        const langClass = lang?.trim() ? ` class="language-${escapeHtml(lang.trim().split(/\s+/)[0])}"` : "";
        return `<pre><code${langClass}>${escapeHtml(content)}</code></pre>\n`;
      },
    },
    extensions: [
      {
        name: "wikilink",
        level: "inline",
        start(src: string) {
          return src.indexOf("[[");
        },
        tokenizer(src: string) {
          const match = /^\[\[([^\]|#]+)(?:#([^\]|]+))?(?:\|([^\]]+))?\]\]/.exec(src);
          if (!match) return undefined;
          const target = match[1].trim();
          const alias = match[3]?.trim();
          return {
            type: "wikilink",
            raw: match[0],
            target,
            display: alias || target,
          };
        },
        renderer(token: Tokens.Generic) {
          const orphan = !noteTitles.has((token.target as string).toLowerCase());
          const cls = orphan ? "md-wikilink md-wikilink-orphan" : "md-wikilink";
          return `<a href="#" class="${cls}" data-wikilink="${escapeHtml(token.target as string)}">${escapeHtml(token.display as string)}</a>`;
        },
      },
      {
        name: "hashtag",
        level: "inline",
        start(src: string) {
          const m = /(?<![\w#/])#[a-zA-Z]/.exec(src);
          return m?.index;
        },
        tokenizer(src: string) {
          const match = /^#([a-zA-Z][\w-]*(?:\/[a-zA-Z][\w-]*)*)/.exec(src);
          if (!match) return undefined;
          return {
            type: "hashtag",
            raw: match[0],
            tag: match[1],
          };
        },
        renderer(token: Tokens.Generic) {
          return `<span class="md-tag">#${escapeHtml(token.tag as string)}</span>`;
        },
      },
      {
        name: "highlight",
        level: "inline",
        start(src: string) {
          return src.indexOf("==");
        },
        tokenizer(src: string) {
          const match = /^==([^=]+)==/.exec(src);
          if (!match) return undefined;
          return {
            type: "highlight",
            raw: match[0],
            text: match[1],
          };
        },
        renderer(token: Tokens.Generic) {
          return `<mark class="md-highlight">${escapeHtml(token.text as string)}</mark>`;
        },
      },
      {
        // marked's built-in GFM "del" rule already accepts a single "~" as an
        // alternate strikethrough delimiter (`~~?`), so this has to run first
        // and claim single-tilde spans — which it does naturally, since its
        // regex requires a non-"~" character right after the opening "~" and
        // therefore never matches at the start of a genuine "~~...~~" span.
        name: "subscript",
        level: "inline",
        start(src: string) {
          return src.indexOf("~");
        },
        tokenizer(src: string) {
          const match = /^~([^~]+)~/.exec(src);
          if (!match) return undefined;
          return {
            type: "subscript",
            raw: match[0],
            text: match[1],
          };
        },
        renderer(token: Tokens.Generic) {
          return `<sub>${escapeHtml(token.text as string)}</sub>`;
        },
      },
      {
        name: "superscript",
        level: "inline",
        start(src: string) {
          return src.indexOf("^");
        },
        tokenizer(src: string) {
          const match = /^\^([^^]+)\^/.exec(src);
          if (!match) return undefined;
          return {
            type: "superscript",
            raw: match[0],
            text: match[1],
          };
        },
        renderer(token: Tokens.Generic) {
          return `<sup>${escapeHtml(token.text as string)}</sup>`;
        },
      },
    ],
  });
}

export function MarkdownPreview({ content, noteTitles, onSelectTitle, onOpenExternal, enabledCodeLanguages }: Props) {
  const enabledLanguageIds = useMemo(() => new Set(enabledCodeLanguages), [enabledCodeLanguages]);

  const render = useCallback(() => {
    const marked = createMarked(noteTitles, enabledLanguageIds);
    const rendered = marked.parse(content, { async: false }) as string;
    return DOMPurify.sanitize(rendered);
  }, [content, noteTitles, enabledLanguageIds]);

  // Renders immediately with whatever language grammars are already loaded
  // (never leaves the preview blank), then re-renders once any additional
  // ones a fenced code block asks for have finished loading.
  const [html, setHtml] = useState(render);

  useEffect(() => {
    setHtml(render());
    const needed = extractNeededLanguageIds(content, enabledLanguageIds);
    if (needed.length === 0) return;
    let cancelled = false;
    ensureLanguagesLoaded(needed).then(() => {
      if (!cancelled) setHtml(render());
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [content, noteTitles, enabledLanguageIds]);

  function handleClick(e: MouseEvent<HTMLDivElement>) {
    const target = e.target as HTMLElement;
    const anchor = target.closest("a");
    if (!anchor) return;
    e.preventDefault();
    const wikiTarget = anchor.getAttribute("data-wikilink");
    if (wikiTarget) {
      onSelectTitle(wikiTarget);
      return;
    }
    const href = anchor.getAttribute("href");
    if (!href) return;
    if (EXTERNAL_SCHEME_RE.test(href)) {
      onOpenExternal(href);
    } else {
      onSelectTitle(titleFromHref(href));
    }
  }

  return (
    <div
      className="markdown-preview"
      onClick={handleClick}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
