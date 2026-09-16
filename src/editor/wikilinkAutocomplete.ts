import type { Completion, CompletionContext, CompletionResult, CompletionSource } from "@codemirror/autocomplete";
import { qualifiedWikilinkTarget, type PickableNote } from "./editorContextMenu";

/** Matches an unfinished "[[partial title" immediately before the cursor —
 *  no closing "]]" yet, and no "|" or "#" (an alias/anchor already started,
 *  which this simple title-only completion doesn't attempt to help with). */
const OPEN_WIKILINK_RE = /\[\[([^[\]|#]*)$/;

/** Powers "type [[ to link" with the same note list and the same source-stack
 *  qualification as the "Insert Link" menu action (see
 *  editorContextMenu.ts's insertNote) — so typing and the menu produce
 *  identical [[Title]] output for the same note, instead of being two
 *  differently-behaved ways to link. */
export function wikilinkCompletionSource(
  getNotes: () => PickableNote[],
  getCurrentSourceStack: () => string | undefined
): CompletionSource {
  return (context: CompletionContext): CompletionResult | null => {
    const match = context.matchBefore(OPEN_WIKILINK_RE);
    if (!match) return null;
    const query = OPEN_WIKILINK_RE.exec(match.text)?.[1] ?? "";
    const from = match.from + match.text.length - query.length;

    const currentSourceStack = getCurrentSourceStack();
    const lowerQuery = query.toLowerCase();
    const options: Completion[] = getNotes()
      .filter((note) => note.title.toLowerCase().includes(lowerQuery))
      .slice(0, 50)
      .map((note) => ({
        label: note.title,
        detail: note.sourceStack,
        apply: `${qualifiedWikilinkTarget(note, currentSourceStack)}]]`,
      }));

    return { from, options, filter: false };
  };
}
