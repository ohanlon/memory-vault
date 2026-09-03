import { describe, expect, it } from "vitest";
import { EditorState } from "@codemirror/state";
import { linkCommandSpec, orderedListSpec, taskListSpec, unorderedListSpec } from "./listCommands";

function apply(doc: string, anchor: number, head: number, spec: (state: EditorState) => ReturnType<typeof linkCommandSpec>) {
  const state = EditorState.create({ doc, selection: { anchor, head } });
  return state.update(spec(state)).state;
}

describe("linkCommandSpec", () => {
  it("wraps a selection in [[...]]", () => {
    const state = apply("hello world", 6, 11, linkCommandSpec);
    expect(state.doc.toString()).toBe("hello [[world]]");
  });

  it("places the cursor after the closing ]] when wrapping a selection", () => {
    const state = apply("hello world", 6, 11, linkCommandSpec);
    expect(state.selection.main.head).toBe(state.doc.length);
  });

  it("inserts an empty [[]] with the cursor inside when nothing is selected", () => {
    const state = apply("hello ", 6, 6, linkCommandSpec);
    expect(state.doc.toString()).toBe("hello [[]]");
    expect(state.selection.main.head).toBe(8); // between the two "[["/"]]"pairs
  });
});

describe("unorderedListSpec", () => {
  it("prefixes the current line when nothing is selected", () => {
    const state = apply("item", 2, 2, unorderedListSpec);
    expect(state.doc.toString()).toBe("- item");
  });

  it("prefixes every line touched by a multi-line selection", () => {
    const doc = "one\ntwo\nthree";
    const state = apply(doc, 0, doc.length, unorderedListSpec);
    expect(state.doc.toString()).toBe("- one\n- two\n- three");
  });
});

describe("orderedListSpec", () => {
  it("numbers the current line starting at 1 when nothing is selected", () => {
    const state = apply("item", 0, 0, orderedListSpec);
    expect(state.doc.toString()).toBe("1. item");
  });

  it("numbers every selected line incrementally", () => {
    const doc = "one\ntwo\nthree";
    const state = apply(doc, 0, doc.length, orderedListSpec);
    expect(state.doc.toString()).toBe("1. one\n2. two\n3. three");
  });
});

describe("taskListSpec", () => {
  it("prefixes the current line with an empty checkbox", () => {
    const state = apply("item", 0, 0, taskListSpec);
    expect(state.doc.toString()).toBe("- [ ] item");
  });

  it("prefixes every selected line", () => {
    const doc = "one\ntwo";
    const state = apply(doc, 0, doc.length, taskListSpec);
    expect(state.doc.toString()).toBe("- [ ] one\n- [ ] two");
  });
});
