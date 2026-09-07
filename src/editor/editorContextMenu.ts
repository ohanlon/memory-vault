import { EditorView } from "@codemirror/view";
import {
  bodySpec,
  boldSpec,
  codeBlockSpec,
  heading1Spec,
  heading2Spec,
  heading3Spec,
  heading4Spec,
  heading5Spec,
  heading6Spec,
  highlightSpec,
  inlineCodeSpec,
  inlineMathSpec,
  italicSpec,
  linkCommandSpec,
  mathBlockSpec,
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
  /** False when the selection is empty — Cut/Copy have nothing to act on. */
  hasSelection: boolean;
  cutSelection: () => void;
  copySelection: () => void;
  pasteClipboard: () => void;
  insertLink: () => void;
  makeHeading1: () => void;
  makeHeading2: () => void;
  makeHeading3: () => void;
  makeHeading4: () => void;
  makeHeading5: () => void;
  makeHeading6: () => void;
  makeBody: () => void;
  /** Omit `language` for a plain, language-less block. */
  makeCodeBlock: (language?: string) => void;
  makeMathBlock: () => void;
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
  makeInlineCode: () => void;
  makeInlineMath: () => void;
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
      const { from, to } = view.state.selection.main;
      onRequest({
        x: event.clientX,
        y: event.clientY,
        hasSelection: from !== to,
        cutSelection: () => {
          const text = view.state.sliceDoc(from, to);
          if (!text) return;
          navigator.clipboard.writeText(text).then(() => {
            view.dispatch({ changes: { from, to, insert: "" } });
            view.focus();
          });
        },
        copySelection: () => {
          const text = view.state.sliceDoc(from, to);
          if (!text) return;
          navigator.clipboard.writeText(text).then(() => view.focus());
        },
        pasteClipboard: () => {
          navigator.clipboard.readText().then((text) => {
            view.dispatch(view.state.replaceSelection(text));
            view.focus();
          });
        },
        insertLink: () => apply(linkCommandSpec(view.state)),
        makeHeading1: () => apply(heading1Spec(view.state)),
        makeHeading2: () => apply(heading2Spec(view.state)),
        makeHeading3: () => apply(heading3Spec(view.state)),
        makeHeading4: () => apply(heading4Spec(view.state)),
        makeHeading5: () => apply(heading5Spec(view.state)),
        makeHeading6: () => apply(heading6Spec(view.state)),
        makeBody: () => apply(bodySpec(view.state)),
        makeCodeBlock: (language?: string) => apply(codeBlockSpec(view.state, language)),
        makeMathBlock: () => apply(mathBlockSpec(view.state)),
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
        makeInlineCode: () => apply(inlineCodeSpec(view.state)),
        makeInlineMath: () => apply(inlineMathSpec(view.state)),
      });
      return true;
    },
  });
}
