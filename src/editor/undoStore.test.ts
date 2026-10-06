import { beforeEach, describe, expect, it } from "vitest";
import { EditorState } from "@codemirror/state";
import { history, undo, undoDepth } from "@codemirror/commands";
import { dropUndoState, pruneUndoStates, renameUndoState, saveUndoState, takeUndoState, UNDO_STATE_FIELDS } from "./undoStore";

function editedState(doc: string, insert: string): EditorState {
  const start = EditorState.create({ doc, extensions: [history()] });
  return start.update({ changes: { from: doc.length, insert }, userEvent: "input.type" }).state;
}

function restore(json: unknown): EditorState {
  return EditorState.fromJSON(json, { extensions: [history()] }, UNDO_STATE_FIELDS);
}

describe("undoStore", () => {
  beforeEach(() => {
    for (const p of ["/a.md", "/b.md", "/c.md"]) dropUndoState(p);
  });

  it("round-trips a note's document and undo stack", () => {
    saveUndoState("/a.md", editedState("hello", " world"));
    const state = restore(takeUndoState("/a.md", "hello world"));
    expect(state.doc.toString()).toBe("hello world");
    expect(undoDepth(state)).toBe(1);
    let next = state;
    undo({ state, dispatch: (tr) => (next = tr.state) });
    expect(next.doc.toString()).toBe("hello");
  });

  it("keeps notes' stacks independent", () => {
    saveUndoState("/a.md", editedState("a", "1"));
    saveUndoState("/b.md", editedState("b", "2"));
    expect(restore(takeUndoState("/a.md", "a1")).doc.toString()).toBe("a1");
    expect(restore(takeUndoState("/b.md", "b2")).doc.toString()).toBe("b2");
  });

  it("discards state when the file changed on disk while the tab was in the background", () => {
    saveUndoState("/a.md", editedState("hello", " world"));
    expect(takeUndoState("/a.md", "something else")).toBeNull();
    expect(takeUndoState("/a.md", "hello world")).toBeNull();
  });

  it("returns null for notes with no saved state", () => {
    expect(takeUndoState("/missing.md", "")).toBeNull();
  });

  it("re-keys state on rename", () => {
    saveUndoState("/a.md", editedState("x", "y"));
    renameUndoState("/a.md", "/b.md");
    expect(takeUndoState("/a.md", "xy")).toBeNull();
    expect(takeUndoState("/b.md", "xy")).not.toBeNull();
  });

  it("drops state, and prunes everything not in the open set", () => {
    saveUndoState("/a.md", editedState("x", "y"));
    saveUndoState("/b.md", editedState("x", "y"));
    saveUndoState("/c.md", editedState("x", "y"));
    dropUndoState("/a.md");
    pruneUndoStates(new Set(["/b.md"]));
    expect(takeUndoState("/a.md", "xy")).toBeNull();
    expect(takeUndoState("/b.md", "xy")).not.toBeNull();
    expect(takeUndoState("/c.md", "xy")).toBeNull();
  });
});
