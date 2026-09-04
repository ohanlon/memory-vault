import { EditorView } from "@codemirror/view";
import {
  bodySpec,
  boldSpec,
  heading1Spec,
  heading2Spec,
  heading3Spec,
  heading4Spec,
  heading5Spec,
  heading6Spec,
  highlightSpec,
  italicSpec,
  linkCommandSpec,
  orderedListSpec,
  quoteSpec,
  strikethroughSpec,
  subscriptSpec,
  superscriptSpec,
  taskListSpec,
  unorderedListSpec,
} from "./listCommands";

export interface EditorContextMenuRequest {
  x: number;
  y: number;
  insertLink: () => void;
  makeHeading1: () => void;
  makeHeading2: () => void;
  makeHeading3: () => void;
  makeHeading4: () => void;
  makeHeading5: () => void;
  makeHeading6: () => void;
  makeBody: () => void;
  makeQuote: () => void;
  makeOrderedList: () => void;
  makeUnorderedList: () => void;
  makeTaskList: () => void;
  makeBold: () => void;
  makeItalic: () => void;
  makeStrikethrough: () => void;
  makeSuperscript: () => void;
  makeSubscript: () => void;
  makeHighlight: () => void;
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
        makeHeading1: () => apply(heading1Spec(view.state)),
        makeHeading2: () => apply(heading2Spec(view.state)),
        makeHeading3: () => apply(heading3Spec(view.state)),
        makeHeading4: () => apply(heading4Spec(view.state)),
        makeHeading5: () => apply(heading5Spec(view.state)),
        makeHeading6: () => apply(heading6Spec(view.state)),
        makeBody: () => apply(bodySpec(view.state)),
        makeQuote: () => apply(quoteSpec(view.state)),
        makeOrderedList: () => apply(orderedListSpec(view.state)),
        makeUnorderedList: () => apply(unorderedListSpec(view.state)),
        makeTaskList: () => apply(taskListSpec(view.state)),
        makeBold: () => apply(boldSpec(view.state)),
        makeItalic: () => apply(italicSpec(view.state)),
        makeStrikethrough: () => apply(strikethroughSpec(view.state)),
        makeSuperscript: () => apply(superscriptSpec(view.state)),
        makeSubscript: () => apply(subscriptSpec(view.state)),
        makeHighlight: () => apply(highlightSpec(view.state)),
      });
      return true;
    },
  });
}
