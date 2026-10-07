// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { EditorState } from "@codemirror/state";
import { EditorView, runScopeHandlers } from "@codemirror/view";
import { markdown } from "@codemirror/lang-markdown";
import { basicSetup } from "codemirror";
import { formatShortcutsKeymap } from "./formatShortcuts";

function press(key: string): string {
  const view = new EditorView({
    parent: document.body,
    state: EditorState.create({
      doc: "# T\n\nfoo bar baz",
      selection: { anchor: 7, head: 10 },
      extensions: [basicSetup, markdown(), formatShortcutsKeymap()],
    }),
  });
  const ev = new KeyboardEvent("keydown", { key, ctrlKey: true, bubbles: true, cancelable: true });
  Object.defineProperty(ev, "keyCode", { value: key.toUpperCase().charCodeAt(0) });
  runScopeHandlers(view, ev, "editor");
  return view.state.doc.toString();
}

describe("formatShortcutsKeymap alongside basicSetup", () => {
  it("Mod-b bolds the selection", () => expect(press("b")).toBe("# T\n\nfo**o b**ar baz"));
  it("Mod-i italicises the selection (not selectParentSyntax)", () => expect(press("i")).toBe("# T\n\nfo*o b*ar baz"));
  it("Mod-u underlines the selection", () => expect(press("u")).toBe("# T\n\nfo<u>o b</u>ar baz"));
});
