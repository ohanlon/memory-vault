import { EditorState, Transaction, type Extension } from "@codemirror/state";
import { keymap } from "@codemirror/view";
import { history, historyKeymap, isolateHistory } from "@codemirror/commands";
import { ExternalChange } from "@uiw/react-codemirror";

// CodeMirror merges adjacent edits into one undo step until typing pauses for
// this long (it defaults to 500 ms, which feels like a few words at a time).
export const UNDO_GROUP_DELAY_MS = 1500;

// Events CodeMirror may merge into the surrounding typing burst. "input" alone
// is Enter. Everything else (paste, drop, autocomplete, cut, formatting and
// list commands, replace-all, ...) is its own undo step.
const TYPING_EVENT = /^(input\.type|delete\.(backward|forward)|input$)/;

/**
 * Per-note undo/redo with logical steps:
 *  - a burst of typing (until a pause, or the cursor jumping elsewhere) is one step;
 *  - paste, cut, drop, autocomplete, formatting and programmatic edits each get
 *    their own step and never merge with adjacent typing;
 *  - loads/reloads from disk (marked ExternalChange by the editor wrapper) are
 *    not undoable — the existing stack is mapped over them instead — unless the
 *    caller explicitly sets addToHistory (e.g. restoring a version).
 */
export function undoGroups(): Extension {
  return [
    history({ newGroupDelay: UNDO_GROUP_DELAY_MS }),
    keymap.of(historyKeymap),
    EditorState.transactionExtender.of((tr) => {
      if (!tr.docChanged) return null;
      if (tr.annotation(ExternalChange)) {
        return tr.annotation(Transaction.addToHistory) === undefined
          ? { annotations: Transaction.addToHistory.of(false) }
          : null;
      }
      if (tr.annotation(isolateHistory)) return null;
      const event = tr.annotation(Transaction.userEvent);
      if (event && /^(undo|redo)/.test(event)) return null;
      if (event && TYPING_EVENT.test(event)) return null;
      return { annotations: isolateHistory.of("full") };
    }),
  ];
}
