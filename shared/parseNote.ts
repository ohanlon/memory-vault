import matter from "gray-matter";
import type { Note, WikiLink } from "./types";

// Replaces fenced (```...``` / ~~~...~~~) and inline (`...`) code spans with
// equal-length spaces so link/tag extraction never looks inside code —
// e.g. a line like `[[Note]]` in a code example shouldn't become a real link.
function maskCodeSpans(content: string): string {
  return content
    .replace(/```[\s\S]*?```/g, (m) => " ".repeat(m.length))
    .replace(/~~~[\s\S]*?~~~/g, (m) => " ".repeat(m.length))
    .replace(/`[^`\n]+`/g, (m) => " ".repeat(m.length));
}

const WIKILINK_RE = /\[\[([^\]|#]+)(?:#([^\]|]+))?(?:\|([^\]]+))?\]\]/g;

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
const MARKDOWN_LINK_RE = /(?<!!)\[([^\]]*)\]\(([^)]+)\)/g;
// Schemes we treat as "external" nodes in the graph. Other schemes
// (javascript:, data:, file:, etc.) are ignored rather than opened.
const EXTERNAL_SCHEME_RE = /^(https?:|mailto:)/i;

export function extractMarkdownLinks(content: string): WikiLink[] {
  const links: WikiLink[] = [];
  const masked = maskCodeSpans(content);
  for (const match of masked.matchAll(MARKDOWN_LINK_RE)) {
    const [, text, hrefRaw] = match;
    let href = hrefRaw.trim();
    // Drop an optional trailing "title" or 'title' part, e.g. [text](Note.md "title").
    const titleSuffix = href.match(/\s+(["'])(?:(?!\1)[\s\S])*\1$/);
    if (titleSuffix) href = href.slice(0, titleSuffix.index).trim();
    // Destinations may be wrapped in <...>, which permits literal spaces inside.
    if (href.startsWith("<")) {
      const end = href.indexOf(">");
      href = end >= 0 ? href.slice(1, end) : href.slice(1);
    }
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

export function parseNote(params: {
  path: string;
  relativePath: string;
  raw: string;
  mtimeMs: number;
}): Note {
  const { path, relativePath, raw, mtimeMs } = params;
  const { data, content } = matter(raw);
  return {
    path,
    relativePath,
    title: titleFromPath(relativePath),
    frontmatter: data ?? {},
    tags: Array.from(new Set([...extractTags(data ?? {}), ...extractInlineTags(content)])),
    links: [...extractWikiLinks(content), ...extractMarkdownLinks(content)],
    content,
    mtimeMs,
  };
}
