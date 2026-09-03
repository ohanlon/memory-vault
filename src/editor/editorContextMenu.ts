import { EditorView } from "@codemirror/view";
import { linkCommandSpec, orderedListSpec, taskListSpec, unorderedListSpec } from "./listCommands";

export interface EditorContextMenuRequest {
  x: number;
  y: number;
  insertLink: () => void;
  makeOrderedList: () => void;
  makeUnorderedList: () => void;
  makeTaskList: () => void;
}

/**
 * Replaces the browser's native context menu with ours whenever right-clicking
 * inside the editor (in edit mode — this extension is only attached to the
 * CodeMirror instance, not the read-only preview), regardless of selection state.
 */
export function editorContextMenu(onRequest: (req: EditorContextMenuRequest) => void) {
  return EditorView.domEventHandlers({
    contextmenu(event, view) {
      event.preventDefault();
      const apply = (spec: ReturnType<typeof linkCommandSpec>) => {
        view.dispatch(spec);
        view.focus();
      };
      onRequest({
        x: event.clientX,
        y: event.clientY,
        insertLink: () => apply(linkCommandSpec(view.state)),
        makeOrderedList: () => apply(orderedListSpec(view.state)),
        makeUnorderedList: () => apply(unorderedListSpec(view.state)),
        makeTaskList: () => apply(taskListSpec(view.state)),
      });
      return true;
    },
  });
}
