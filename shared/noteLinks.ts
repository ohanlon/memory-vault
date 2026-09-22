import type { WikiLink } from "./types";

// Deliberately has no dependency on gray-matter (unlike parseNote.ts, which
// re-exports everything here) - src/export/vaultExport.ts, part of the
// renderer bundle, needs these pure link/tag helpers without pulling
// gray-matter (and its transitive js-yaml/esprima deps, which do a runtime
// require() that crashes the sandboxed renderer) along for the ride. See
// CLAUDE.md's note on src/editor/livePreview.ts for the same constraint.

// Replaces fenced (```...``` / ~~~...~~~) and inline (`...`) code spans with
// equal-length spaces so link/tag extraction never looks inside code —
// e.g. a line like `[[Note]]` in a code example shouldn't become a real link.
export function maskCodeSpans(content: string): string {
  return content
    .replace(/```[\s\S]*?```/g, (m) => " ".repeat(m.length))
    .replace(/~~~[\s\S]*?~~~/g, (m) => " ".repeat(m.length))
    .replace(/`[^`\n]+`/g, (m) => " ".repeat(m.length));
}

export const WIKILINK_RE = /\[\[([^\]|#]+)(?:#([^\]|]+))?(?:\|([^\]]+))?\]\]/g;

export function extractWikiLinks(content: string): WikiLink[] {
  const links: WikiLink[] = [];
  const masked = maskCodeSpans(content);
  for (const match of masked.matchAll(WIKILINK_RE)) {
    const [, target, header, alias] = match;
    links.push({
      target: target.trim(),
      header: header?.trim(),
      alias: alias?.trim(),
    });
  }
  return links;
}

// Matches [text](target) but not image embeds ![text](target).
export const MARKDOWN_LINK_RE = /(?<!!)\[([^\]]*)\]\(([^)]+)\)/g;
// Schemes we treat as "external" nodes in the graph. Other schemes
// (javascript:, data:, file:, etc.) are ignored rather than opened.
export const EXTERNAL_SCHEME_RE = /^(https?:|mailto:)/i;

// Drops an optional trailing "title"/'title' part (e.g. [text](Note.md
// "title")) and unwraps a <...>-bracketed destination (which permits
// literal spaces inside) - shared by extractMarkdownLinks and
// rewriteNoteLinksForExport, which both need the same raw href cleaned up
// the same way before deciding what to do with it.
function cleanMarkdownLinkHref(hrefRaw: string): string {
  let href = hrefRaw.trim();
  const titleSuffix = href.match(/\s+(["'])(?:(?!\1)[\s\S])*\1$/);
  if (titleSuffix) href = href.slice(0, titleSuffix.index).trim();
  if (href.startsWith("<")) {
    const end = href.indexOf(">");
    href = end >= 0 ? href.slice(1, end) : href.slice(1);
  }
  return href;
}

export function extractMarkdownLinks(content: string): WikiLink[] {
  const links: WikiLink[] = [];
  const masked = maskCodeSpans(content);
  for (const match of masked.matchAll(MARKDOWN_LINK_RE)) {
    const [, text, hrefRaw] = match;
    const href = cleanMarkdownLinkHref(hrefRaw);
    if (!href || href.startsWith("#")) continue;

    if (EXTERNAL_SCHEME_RE.test(href)) {
      const alias = text.trim();
      links.push({ target: href, alias: alias || undefined, external: true });
      continue;
    }
    if (/^[a-z][a-z0-9+.-]*:/i.test(href)) continue; // skip other schemes (javascript:, data:, etc.)

    const [pathPart, headerPart] = href.split("#");
    if (!pathPart.toLowerCase().endsWith(".md")) continue;

    let decodedPath: string;
    try {
      decodedPath = decodeURIComponent(pathPart);
    } catch {
      decodedPath = pathPart;
    }

    const target = titleFromPath(decodedPath);
    const alias = text.trim();
    links.push({
      target,
      header: headerPart?.trim() || undefined,
      alias: alias && alias !== target ? alias : undefined,
    });
  }
  return links;
}

// Rewrites every [[wikilink]] in `content` into a plain markdown link to
// resolveSlug's anchor - [display](#slug) - or, if resolveSlug can't place
// it (an orphan), just the display text with the [[ ]] syntax stripped.
// Used by the vault-wide HTML/PDF export (src/export/vaultExport.ts), where
// every note becomes one <section> of a single combined document rather
// than a separate file a wikilink could navigate to.
export function rewriteWikilinksForExport(content: string, resolveSlug: (title: string) => string | undefined): string {
  const masked = maskCodeSpans(content);
  let result = "";
  let lastIndex = 0;
  for (const match of masked.matchAll(WIKILINK_RE)) {
    const [full, target, , alias] = match;
    const display = (alias ?? target).trim();
    const slug = resolveSlug(target.trim());
    const replacement = slug ? `[${display}](#${slug})` : display;
    result += content.slice(lastIndex, match.index) + replacement;
    lastIndex = match.index + full.length;
  }
  return result + content.slice(lastIndex);
}

// Rewrites every [text](Note.md) / [text](Note.md#Header) markdown link
// (not image embeds, external URLs, or other-scheme links) into
// [text](#slug) via resolveSlug - same purpose as rewriteWikilinksForExport,
// for plain markdown links instead of [[wikilinks]]. Leaves anything
// resolveSlug can't place untouched, including its original (now-dangling)
// .md target, rather than breaking the link entirely.
export function rewriteNoteLinksForExport(content: string, resolveSlug: (title: string) => string | undefined): string {
  const masked = maskCodeSpans(content);
  let result = "";
  let lastIndex = 0;
  for (const match of masked.matchAll(MARKDOWN_LINK_RE)) {
    const [full, text, hrefRaw] = match;
    const href = cleanMarkdownLinkHref(hrefRaw);
    let replacement = full;
    if (href && !href.startsWith("#") && !EXTERNAL_SCHEME_RE.test(href) && !/^[a-z][a-z0-9+.-]*:/i.test(href)) {
      const [pathPart] = href.split("#");
      if (pathPart.toLowerCase().endsWith(".md")) {
        let decodedPath: string;
        try {
          decodedPath = decodeURIComponent(pathPart);
        } catch {
          decodedPath = pathPart;
        }
        const slug = resolveSlug(titleFromPath(decodedPath));
        if (slug) replacement = `[${text}](#${slug})`;
      }
    }
    result += content.slice(lastIndex, match.index) + replacement;
    lastIndex = match.index + full.length;
  }
  return result + content.slice(lastIndex);
}

// Matches image embeds ![text](target) - the mirror image of MARKDOWN_LINK_RE's
// negative lookbehind, which deliberately excludes these.
const IMAGE_EMBED_RE = /!\[([^\]]*)\]\(([^)]+)\)/g;

// Every image embed's raw href, exactly as written (not resolved or
// filtered by scheme) - used by electron/attachments.ts to figure out which
// attachments are still referenced by some note. Unlike extractMarkdownLinks,
// this doesn't restrict to .md targets or drop external URLs, since the
// caller needs to tell those apart from a relative attachment path itself.
export function extractImageEmbeds(content: string): string[] {
  const hrefs: string[] = [];
  const masked = maskCodeSpans(content);
  for (const match of masked.matchAll(IMAGE_EMBED_RE)) {
    let href = match[2].trim();
    // Drop an optional trailing "title" or 'title' part, e.g. ![alt](foo.png "title").
    const titleSuffix = href.match(/\s+(["'])(?:(?!\1)[\s\S])*\1$/);
    if (titleSuffix) href = href.slice(0, titleSuffix.index).trim();
    // Destinations may be wrapped in <...>, which permits literal spaces inside.
    if (href.startsWith("<")) {
      const end = href.indexOf(">");
      href = end >= 0 ? href.slice(1, end) : href.slice(1);
    }
    if (href) hrefs.push(href);
  }
  return hrefs;
}

export function extractTags(frontmatter: Record<string, unknown>): string[] {
  const raw = frontmatter.tags;
  if (Array.isArray(raw)) {
    return raw.filter((t): t is string => typeof t === "string");
  }
  if (typeof raw === "string" && raw.trim().length > 0) {
    return raw.split(",").map((t) => t.trim()).filter(Boolean);
  }
  return [];
}

// #tag or #nested/tag, not preceded by a word char (so "issue#123" or "##"
// don't match) and not immediately followed by a space (so markdown
// headings like "# Heading" don't match). Must start with a letter so bare
// numbers like "#123" aren't picked up as tags.
const INLINE_TAG_RE = /(?<![\w#/])#([a-zA-Z][\w-]*(?:\/[a-zA-Z][\w-]*)*)/g;

export function extractInlineTags(content: string): string[] {
  // Mask code spans, then strip wikilinks and markdown links, so a "#Header"
  // anchor inside [[Note#Header]] / (Note.md#Header), or a literal "#tag"
  // used as a code example, isn't mistaken for a real inline tag.
  const masked = maskCodeSpans(content);
  const withoutLinks = masked.replace(WIKILINK_RE, " ").replace(MARKDOWN_LINK_RE, " ");
  const tags = new Set<string>();
  for (const match of withoutLinks.matchAll(INLINE_TAG_RE)) {
    tags.add(match[1]);
  }
  return Array.from(tags);
}

export function titleFromPath(relativePath: string): string {
  const base = relativePath.split(/[\\/]/).pop() ?? relativePath;
  return base.replace(/\.md$/i, "");
}
