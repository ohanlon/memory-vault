import matter from "gray-matter";
import type { Note } from "./types";
import { extractInlineTags, extractMarkdownLinks, extractTags, extractWikiLinks, titleFromPath } from "./noteLinks";

// Every pure link/tag helper lives in noteLinks.ts, which has no
// gray-matter dependency - re-exported here so existing imports of this
// module keep working. src/export/vaultExport.ts (renderer-bundled) imports
// noteLinks.ts directly instead of this file, specifically to avoid pulling
// gray-matter into the renderer bundle - see noteLinks.ts's own comment.
export {
  extractImageEmbeds,
  extractInlineTags,
  extractMarkdownLinks,
  extractTags,
  extractWikiLinks,
  rewriteNoteLinksForExport,
  rewriteWikilinksForExport,
  titleFromPath,
} from "./noteLinks";

export function parseNote(params: { path: string; relativePath: string; raw: string; mtimeMs: number }): Note {
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
