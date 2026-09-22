import DOMPurify from "dompurify";
import type { Note } from "@shared/types";
import { extractImageEmbeds, rewriteNoteLinksForExport, rewriteWikilinksForExport } from "@shared/noteLinks";
import { resolveRelativeAttachmentPath } from "@shared/attachmentPath";
import { slugify, uniqueSlug } from "@shared/slugify";
import { createMarked } from "../components/MarkdownPreview";
import { ensureLanguagesLoaded, extractNeededLanguageIds } from "../editor/codeHighlight";

export type ExportFormat = "markdown" | "html" | "pdf";

export type ReadAttachmentsAsDataUrls = (root: string, rootRelativePaths: string[]) => Promise<Record<string, string>>;

function sortedByTitle(notes: Note[]): Note[] {
  return [...notes].sort((a, b) => a.title.localeCompare(b.title));
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// One combined markdown file, notes sorted alphabetically by title and
// separated by a horizontal rule. Simplest export format: no rendering, so
// wikilinks/image references stay exactly as written (and image references
// stay relative to wherever the original notes folder's attachments/ was,
// which won't travel with this single file - see the README).
export function buildMarkdownExport(notes: Note[]): string {
  return sortedByTitle(notes)
    .map((note) => `# ${note.title}\n\n${note.content.trim()}\n`)
    .join("\n---\n\n");
}

function buildTitleToSlug(notes: Note[]): Map<string, string> {
  const taken = new Set<string>();
  const map = new Map<string, string>();
  for (const note of sortedByTitle(notes)) {
    map.set(note.title.toLowerCase(), uniqueSlug(taken, slugify(note.title)));
  }
  return map;
}

// A compact, self-contained stylesheet for the export - deliberately not an
// attempt to replicate the live app's theme (that's expressed via CSS
// custom properties resolved by React/Electron's own runtime, meaningless
// in a static file meant to be opened standalone, possibly on another
// machine entirely). Tuned for on-screen reading and printing alike, since
// the same HTML also becomes the PDF export's source. Doesn't bundle
// KaTeX's own stylesheet (importing it as a raw string broke the packaged
// renderer bundle - vite-plugin-electron-renderer treats an unrecognized
// import specifier as a Node require() it needs to shim, which a "*.css?raw"
// specifier isn't), so a $$math block$$ renders via KaTeX's inline
// structure/spacing but with system fallback fonts instead of its own.
const EXPORT_STYLE = `
body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif; max-width: 820px; margin: 40px auto; padding: 0 24px; line-height: 1.65; color: #1c1c1c; background: #fff; }
h1, h2, h3, h4, h5, h6 { line-height: 1.3; }
nav.toc { border: 1px solid #ddd; border-radius: 8px; padding: 16px 24px; margin-bottom: 48px; background: #f7f7f8; }
nav.toc h2 { margin-top: 0; font-size: 13px; letter-spacing: 0.04em; text-transform: uppercase; color: #666; }
nav.toc ul { columns: 2; padding-left: 20px; }
nav.toc a, article a { color: #2454c7; }
article { margin-bottom: 56px; padding-bottom: 40px; border-bottom: 1px solid #eee; }
article:last-of-type { border-bottom: none; }
article img { max-width: 100%; }
code { background: #f2f2f3; padding: 1px 5px; border-radius: 4px; font-size: 0.9em; }
pre.md-code-pre { position: relative; background: #f2f2f3; border-radius: 6px; padding: 14px; overflow-x: auto; }
pre.md-code-pre code { background: none; padding: 0; }
.md-code-lang-badge { position: absolute; top: 6px; right: 10px; font-size: 11px; color: #888; text-transform: uppercase; }
blockquote { margin: 0; padding-left: 16px; border-left: 3px solid #ddd; color: #555; }
.md-tag { color: #6b5bd6; }
.md-wikilink-orphan { color: #999; }
.hljs-keyword, .hljs-selector-tag, .hljs-literal, .hljs-type { color: #a35a00; }
.hljs-string, .hljs-attr, .hljs-attribute, .hljs-addition { color: #22863a; }
.hljs-comment, .hljs-quote { color: #6a737d; font-style: italic; }
.hljs-number { color: #b5591f; }
.hljs-title, .hljs-name, .hljs-selector-id, .hljs-selector-class { color: #005cc5; }
.hljs-built_in, .hljs-symbol, .hljs-regexp { color: #a02f6f; }
`;

// One combined, self-contained HTML file: every note becomes a <section>
// with its own #slug anchor, wikilinks/markdown-links to another exported
// note become in-document anchor links (shared/parseNote.ts's rewrite
// helpers - a linked note has no separate file to navigate to anymore), and
// every attachment image gets inlined as a data: URL (readAttachmentsAsDataUrls
// batches all of them up front, since marked's own render callbacks are
// synchronous). Reuses MarkdownPreview.tsx's marked setup so code
// highlighting/math/tags/etc. render the same way the in-app Preview does.
export async function buildHtmlExport(
  root: string,
  notes: Note[],
  enabledCodeLanguages: string[],
  readAttachmentsAsDataUrls: ReadAttachmentsAsDataUrls
): Promise<string> {
  const sorted = sortedByTitle(notes);
  const titleToSlug = buildTitleToSlug(sorted);
  const resolveSlug = (title: string) => titleToSlug.get(title.toLowerCase());

  const neededPaths = new Set<string>();
  for (const note of sorted) {
    for (const href of extractImageEmbeds(note.content)) {
      const resolved = resolveRelativeAttachmentPath(note.relativePath, href);
      if (resolved) neededPaths.add(resolved);
    }
  }
  const imageDataUrls = neededPaths.size > 0 ? await readAttachmentsAsDataUrls(root, [...neededPaths]) : {};

  const enabledLanguageIds = new Set(enabledCodeLanguages);
  const sections: string[] = [];
  for (const note of sorted) {
    const rewritten = rewriteNoteLinksForExport(rewriteWikilinksForExport(note.content, resolveSlug), resolveSlug);

    const needed = extractNeededLanguageIds(rewritten, enabledLanguageIds);
    if (needed.length > 0) await ensureLanguagesLoaded(needed);

    const marked = createMarked(note.relativePath, new Set(), enabledLanguageIds, (href) => {
      const resolved = resolveRelativeAttachmentPath(note.relativePath, href);
      return (resolved && imageDataUrls[resolved]) || href;
    });
    const html = DOMPurify.sanitize(marked.parse(rewritten, { async: false }) as string);
    sections.push(`<article id="${resolveSlug(note.title)}"><h1>${escapeHtml(note.title)}</h1>${html}</article>`);
  }

  const toc = sorted.map((n) => `<li><a href="#${resolveSlug(n.title)}">${escapeHtml(n.title)}</a></li>`).join("");

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Cairn export</title>
<style>${EXPORT_STYLE}</style>
</head>
<body>
<nav class="toc"><h2>Contents</h2><ul>${toc}</ul></nav>
${sections.join("\n")}
</body>
</html>
`;
}
