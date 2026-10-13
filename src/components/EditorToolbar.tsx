import type { EditorView } from "@codemirror/view";
import type { EditorState, TransactionSpec } from "@codemirror/state";
import { redo, undo } from "@codemirror/commands";
import {
  boldSpec,
  heading2Spec,
  inlineCodeSpec,
  italicSpec,
  linkCommandSpec,
  taskListSpec,
  unorderedListSpec,
} from "../editor/listCommands";

interface Props {
  getView: () => EditorView | null;
}

type Action = { label: string; title: string; run: (view: EditorView) => void };

function spec(make: (state: EditorState) => TransactionSpec): Action["run"] {
  return (view) => view.dispatch(make(view.state));
}

const ACTIONS: Action[] = [
  { label: "↶", title: "Undo", run: (v) => void undo(v) },
  { label: "↷", title: "Redo", run: (v) => void redo(v) },
  { label: "B", title: "Bold", run: spec(boldSpec) },
  { label: "I", title: "Italic", run: spec(italicSpec) },
  { label: "H", title: "Heading", run: spec(heading2Spec) },
  { label: "•", title: "Bullet list", run: spec(unorderedListSpec) },
  { label: "☑", title: "Task list", run: spec(taskListSpec) },
  { label: "🔗", title: "Link", run: spec(linkCommandSpec) },
  { label: "</>", title: "Inline code", run: spec(inlineCodeSpec) },
  {
    label: "⋯",
    title: "More",
    // Re-enter the editor's own context-menu handler so the sheet offers exactly the same actions,
    // including the link-aware ones, without a second copy of that logic.
    run: (view) => {
      const rect = view.coordsAtPos(view.state.selection.main.head);
      view.contentDOM.dispatchEvent(
        new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: rect?.left ?? 0, clientY: rect?.top ?? 0 })
      );
    },
  },
];

/** Formatting shortcuts shown at phone width, where the editor's right-click menu is out of reach. */
export function EditorToolbar({ getView }: Props) {
  return (
    <div className="editor-toolbar" role="toolbar" aria-label="Formatting">
      {ACTIONS.map((a) => (
        <button
          key={a.title}
          className="editor-toolbar-btn"
          aria-label={a.title}
          title={a.title}
          // Keep focus (and the soft keyboard) in the editor.
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            const view = getView();
            if (!view) return;
            a.run(view);
            view.focus();
          }}
        >
          {a.label}
        </button>
      ))}
    </div>
  );
}
