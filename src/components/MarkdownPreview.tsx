import { useMemo, MouseEvent } from "react";
import { Marked, type Tokens } from "marked";
import DOMPurify from "dompurify";
import { EXTERNAL_SCHEME_RE, titleFromHref } from "../editor/livePreview";

interface Props {
  content: string;
  noteTitles: Set<string>;
  onSelectTitle: (title: string) => void;
  onOpenExternal: (url: string) => void;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function createMarked(noteTitles: Set<string>) {
  return new Marked({
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
    ],
  });
}

export function MarkdownPreview({ content, noteTitles, onSelectTitle, onOpenExternal }: Props) {
  const html = useMemo(() => {
    const marked = createMarked(noteTitles);
    const rendered = marked.parse(content, { async: false }) as string;
    return DOMPurify.sanitize(rendered);
  }, [content, noteTitles]);

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
