import type { Note } from "./types";
import { maskCodeSpans, WIKILINK_RE } from "./noteLinks";

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Expands every [[wikilink]] in `note`'s content that resolves to another
 * note into a collapsed <details> block holding that note's own content
 * (recursively expanded the same way) right after the link — the "Composite"
 * editor view's markdown source, before it's handed to the normal
 * MarkdownPreview/marked rendering pipeline unchanged. <details>/<summary>
 * are raw HTML blocks as far as marked is concerned; blank lines around the
 * nested markdown keep it parsed as its own block rather than swallowed as
 * literal HTML, and the final DOMPurify.sanitize pass MarkdownPreview
 * already does covers this content exactly like everything else it renders.
 *
 * `ancestors` (lowercased titles already being expanded in this chain,
 * including `note` itself) guards against a link cycle recursing forever —
 * a link back to one of them is left as a plain, unexpanded link instead.
 */
export function expandNoteForComposite(
  note: Note,
  notesByTitle: ReadonlyMap<string, Note>,
  ancestors: readonly string[] = [note.title.toLowerCase()]
): string {
  const masked = maskCodeSpans(note.content);
  let result = "";
  let lastIndex = 0;

  for (const match of masked.matchAll(WIKILINK_RE)) {
    const end = match.index + match[0].length;
    result += note.content.slice(lastIndex, end);
    lastIndex = end;

    const target = match[1].trim();
    const targetKey = target.toLowerCase();
    const targetNote = notesByTitle.get(targetKey);
    if (!targetNote) continue; // unresolved link - nothing to expand

    if (ancestors.includes(targetKey)) {
      result += ` *(circular reference to "${escapeHtml(target)}")*`;
      continue;
    }

    const childMarkdown = expandNoteForComposite(targetNote, notesByTitle, [...ancestors, targetKey]);
    result += `\n\n<details class="md-embed"><summary>${escapeHtml(targetNote.title)}</summary>\n\n${childMarkdown}\n\n</details>\n\n`;
  }

  result += note.content.slice(lastIndex);
  return result;
}
