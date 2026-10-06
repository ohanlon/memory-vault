import { describe, expect, it } from "vitest";
import { EditorState, Transaction, type TransactionSpec } from "@codemirror/state";
import { isolateHistory, redo, undo, undoDepth } from "@codemirror/commands";
import { ExternalChange } from "@uiw/react-codemirror";
import { undoGroups } from "./undoGroups";

class Editor {
  state: EditorState;
  now = 1_000_000_000;
  constructor(doc = "") {
    this.state = EditorState.create({ doc, extensions: [undoGroups()] });
  }
  dispatch(spec: TransactionSpec, advanceMs = 10) {
    this.now += advanceMs;
    this.state = this.state.update(spec, { annotations: Transaction.time.of(this.now) }).state;
  }
  type(text: string, advanceMs = 10) {
    const end = this.state.doc.length;
    this.dispatch({ changes: { from: end, insert: text }, selection: { anchor: end + text.length }, userEvent: "input.type" }, advanceMs);
  }
  run(command: typeof undo) {
    command({ state: this.state, dispatch: (tr) => (this.state = tr.state) });
  }
  get doc() {
    return this.state.doc.toString();
  }
}

describe("undoGroups", () => {
  it("merges a burst of typing into one undo step", () => {
    const ed = new Editor();
    for (const ch of "hello world") ed.type(ch, 100);
    expect(undoDepth(ed.state)).toBe(1);
    ed.run(undo);
    expect(ed.doc).toBe("");
  });

  it("starts a new step after a pause longer than the group delay", () => {
    const ed = new Editor();
    ed.type("one");
    ed.type(" two", 2000);
    expect(undoDepth(ed.state)).toBe(2);
    ed.run(undo);
    expect(ed.doc).toBe("one");
  });

  it("keeps a paste as its own step, separate from surrounding typing", () => {
    const ed = new Editor();
    ed.type("a");
    ed.dispatch({ changes: { from: 1, insert: "PASTED" }, selection: { anchor: 7 }, userEvent: "input.paste" });
    ed.type("b");
    expect(undoDepth(ed.state)).toBe(3);
    ed.run(undo);
    expect(ed.doc).toBe("aPASTED");
    ed.run(undo);
    expect(ed.doc).toBe("a");
  });

  it("keeps programmatic edits (formatting commands) as their own step", () => {
    const ed = new Editor("x");
    ed.type("y");
    ed.dispatch({ changes: { from: 0, insert: "**" } });
    ed.type("z");
    expect(undoDepth(ed.state)).toBe(3);
  });

  it("does not make external reloads undoable but keeps earlier history usable", () => {
    const ed = new Editor();
    ed.type("typed");
    ed.dispatch({ changes: { from: 0, insert: "disk: " }, annotations: ExternalChange.of(true) });
    expect(undoDepth(ed.state)).toBe(1);
    ed.run(undo);
    // The reload itself is not rolled back; only our own edit is, mapped over it.
    expect(ed.doc).toBe("disk: ");
  });

  it("makes an explicitly tracked external change (version restore) its own undoable step", () => {
    const ed = new Editor();
    ed.type("current");
    ed.dispatch({
      changes: { from: 0, to: 7, insert: "restored" },
      annotations: [ExternalChange.of(true), Transaction.addToHistory.of(true), isolateHistory.of("full")],
    });
    ed.type("!");
    expect(undoDepth(ed.state)).toBe(3);
    ed.run(undo);
    expect(ed.doc).toBe("restored");
    ed.run(undo);
    expect(ed.doc).toBe("current");
    ed.run(redo);
    expect(ed.doc).toBe("restored");
  });
});
