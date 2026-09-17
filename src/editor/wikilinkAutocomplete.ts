import type { Completion, CompletionContext, CompletionResult, CompletionSource } from "@codemirror/autocomplete";
import type { PickableNote } from "./editorContextMenu";

/** Matches an unfinished "[[partial title" immediately before the cursor —
 *  no closing "]]" yet, and no "|" or "#" (an alias/anchor already started,
 *  which this simple title-only completion doesn't attempt to help with). */
const OPEN_WIKILINK_RE = /\[\[([^[\]|#]*)$/;

/** CodeMirror's closeBrackets extension auto-inserts "]]" right after the
 *  cursor the moment "[[" is typed, so by the time a completion is accepted
 *  the closing brackets are usually already there waiting — appending our
 *  own "]]" on top would double them up (e.g. "[[Note]]]]"). Only add them
 *  when they're not already sitting immediately after the cursor. */
export function wikilinkInsertText(target: string, textAfterCursor: string): string {
  return textAfterCursor.startsWith("]]") ? target : `${target}]]`;
}

/** Powers "type [[ to link" with the same note list as the "Insert Link"
 *  menu action (see editorContextMenu.ts's insertNote) — so typing and the
 *  menu produce identical [[Title]] output for the same note, instead of
 *  being two differently-behaved ways to link. */
export function wikilinkCompletionSource(getNotes: () => PickableNote[]): CompletionSource {
  return (context: CompletionContext): CompletionResult | null => {
    const match = context.matchBefore(OPEN_WIKILINK_RE);
    if (!match) return null;
    const query = OPEN_WIKILINK_RE.exec(match.text)?.[1] ?? "";
    const from = match.from + match.text.length - query.length;

    const lowerQuery = query.toLowerCase();
    const options: Completion[] = getNotes()
      .filter((note) => note.title.toLowerCase().includes(lowerQuery))
      .slice(0, 50)
      .map((note) => ({
        label: note.title,
        apply: (view, _completion, completionFrom, completionTo) => {
          const insert = wikilinkInsertText(note.title, view.state.doc.sliceString(completionTo, completionTo + 2));
          view.dispatch({
            changes: { from: completionFrom, to: completionTo, insert },
            selection: { anchor: completionFrom + insert.length },
          });
        },
      }));

    return { from, options, filter: false };
  };
}
