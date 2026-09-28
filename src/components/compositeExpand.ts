import { extractNeededLanguageIds } from "../editor/codeHighlight";
import { createMarked, escapeHtml } from "./MarkdownPreview";

/** The subset of a Note the composite expansion actually needs. */
export interface ExpandableNote {
  title: string;
  relativePath: string;
  content: string;
}

const WIKILINK_ANCHOR_RE = /<a\b[^>]*\bdata-wikilink="([^"]*)"[^>]*>.*?<\/a>/g;

function unescapeHtml(text: string): string {
  return text
    .replace(/&quot;/g, '"')
    .replace(/&gt;/g, ">")
    .replace(/&lt;/g, "<")
    .replace(/&amp;/g, "&");
}

export interface CompositeExpandResult {
  html: string;
  neededLanguageIds: string[];
}

/**
 * Expands every [[wikilink]] anchor in `html` (the already-rendered markup
 * for `note`) that resolves to another note into a collapsed <details>
 * block holding that note's own content — rendered and expanded the same
 * way, recursively.
 *
 * Operates on already-rendered HTML rather than splicing raw markdown/HTML
 * source together: each note is parsed to completion independently first,
 * then the results are stitched in via plain string substitution. An
 * earlier version spliced a <details> block directly into the markdown
 * source and relied on CommonMark's "a raw HTML block ends at the next
 * blank line" rule to keep it nested correctly — that rule is sensitive to
 * exactly what the linked note's own content looks like, and could cut the
 * embedded content short. This approach has no such dependency.
 *
 * `ancestors` (lowercased titles already being expanded in this chain,
 * including `note` itself) guards against a link cycle recursing forever —
 * a link back to one of them gets a "(circular reference)" note instead of
 * expanding again.
 */
export function expandWikilinksInHtml(
  html: string,
  note: ExpandableNote,
  notesByTitle: ReadonlyMap<string, ExpandableNote>,
  noteTitles: Set<string>,
  enabledLanguageIds: ReadonlySet<string>,
  ancestors: readonly string[] = [note.title.toLowerCase()]
): CompositeExpandResult {
  const neededLanguageIds = new Set(extractNeededLanguageIds(note.content, enabledLanguageIds));

  const expandedHtml = html.replace(WIKILINK_ANCHOR_RE, (fullMatch: string, targetEscaped: string) => {
    const target = unescapeHtml(targetEscaped);
    const key = target.toLowerCase();
    const targetNote = notesByTitle.get(key);
    if (!targetNote) return fullMatch; // unresolved link - nothing to expand

    if (ancestors.includes(key)) {
      return `${fullMatch} <em>(circular reference to "${escapeHtml(target)}")</em>`;
    }

    const marked = createMarked(targetNote.relativePath, noteTitles, enabledLanguageIds);
    const childHtml = marked.parse(targetNote.content, { async: false }) as string;
    const child = expandWikilinksInHtml(childHtml, targetNote, notesByTitle, noteTitles, enabledLanguageIds, [
      ...ancestors,
      key,
    ]);
    for (const id of child.neededLanguageIds) neededLanguageIds.add(id);

    return `${fullMatch}<details class="md-embed"><summary>${escapeHtml(targetNote.title)}</summary>${child.html}</details>`;
  });

  return { html: expandedHtml, neededLanguageIds: Array.from(neededLanguageIds) };
}
