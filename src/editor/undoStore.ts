import { EditorState } from "@codemirror/state";
import { historyField } from "@codemirror/commands";

// One EditorPane serves every open note tab, so CodeMirror's own history would
// otherwise be a single stack shared by all notes. Instead each note's last
// EditorState (an immutable value, so keeping the reference is free) is parked
// here keyed by absolute path while another note is showing, and handed back as
// the editor's initial state when the note is re-opened. Undo state lives only
// while the note's tab is open — App.tsx prunes it when tabs close.
const states = new Map<string, EditorState>();

export const UNDO_STATE_FIELDS = { history: historyField };

export function saveUndoState(path: string, state: EditorState): void {
  states.set(path, state);
}

/**
 * Returns the saved state as JSON for `EditorState.fromJSON`, or null if there
 * is none or it is stale. A stored state is only valid if its document still
 * matches what is on disk: if the file changed while the tab was in the
 * background (git pull, CLI/Claude edit, ...) the old undo stack would apply to
 * a different document, so it is discarded.
 */
export function takeUndoState(path: string, diskBody: string): unknown | null {
  const state = states.get(path);
  if (!state) return null;
  if (state.doc.toString() !== diskBody) {
    states.delete(path);
    return null;
  }
  return state.toJSON(UNDO_STATE_FIELDS);
}

export function renameUndoState(oldPath: string, newPath: string): void {
  const state = states.get(oldPath);
  if (!state) return;
  states.delete(oldPath);
  states.set(newPath, state);
}

export function dropUndoState(path: string): void {
  states.delete(path);
}

/** Drops state for every path not in `openPaths` (closed or deleted tabs). */
export function pruneUndoStates(openPaths: ReadonlySet<string>): void {
  for (const path of states.keys()) {
    if (!openPaths.has(path)) states.delete(path);
  }
}
