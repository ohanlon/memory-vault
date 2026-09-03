import { describe, expect, it } from "vitest";
import { EditorState } from "@codemirror/state";
import {
  boldSpec,
  highlightSpec,
  italicSpec,
  linkCommandSpec,
  orderedListSpec,
  strikethroughSpec,
  taskListSpec,
  unorderedListSpec,
} from "./listCommands";

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

describe("boldSpec", () => {
  it("wraps a selection in **...**", () => {
    const state = apply("hello world", 6, 11, boldSpec);
    expect(state.doc.toString()).toBe("hello **world**");
    expect(state.selection.main.head).toBe(state.doc.length);
  });

  it("inserts an empty **** with the cursor inside when nothing is selected", () => {
    const state = apply("", 0, 0, boldSpec);
    expect(state.doc.toString()).toBe("****");
    expect(state.selection.main.head).toBe(2);
  });
});

describe("italicSpec", () => {
  it("wraps a selection in *...*", () => {
    const state = apply("hello world", 6, 11, italicSpec);
    expect(state.doc.toString()).toBe("hello *world*");
    expect(state.selection.main.head).toBe(state.doc.length);
  });

  it("inserts an empty ** with the cursor inside when nothing is selected", () => {
    const state = apply("", 0, 0, italicSpec);
    expect(state.doc.toString()).toBe("**");
    expect(state.selection.main.head).toBe(1);
  });
});

describe("strikethroughSpec", () => {
  it("wraps a selection in ~~...~~", () => {
    const state = apply("hello world", 6, 11, strikethroughSpec);
    expect(state.doc.toString()).toBe("hello ~~world~~");
    expect(state.selection.main.head).toBe(state.doc.length);
  });

  it("inserts an empty ~~~~ with the cursor inside when nothing is selected", () => {
    const state = apply("", 0, 0, strikethroughSpec);
    expect(state.doc.toString()).toBe("~~~~");
    expect(state.selection.main.head).toBe(2);
  });
});

describe("highlightSpec", () => {
  it("wraps a selection in ==...==", () => {
    const state = apply("hello world", 6, 11, highlightSpec);
    expect(state.doc.toString()).toBe("hello ==world==");
    expect(state.selection.main.head).toBe(state.doc.length);
  });

  it("inserts an empty ==== with the cursor inside when nothing is selected", () => {
    const state = apply("", 0, 0, highlightSpec);
    expect(state.doc.toString()).toBe("====");
    expect(state.selection.main.head).toBe(2);
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

  it("places the cursor right after the marker when the line is empty", () => {
    const state = apply("", 0, 0, unorderedListSpec);
    expect(state.doc.toString()).toBe("- ");
    expect(state.selection.main.head).toBe(2);
  });

  it("converts an ordered list line to unordered instead of stacking markers", () => {
    const state = apply("1. item", 0, 0, unorderedListSpec);
    expect(state.doc.toString()).toBe("- item");
  });

  it("converts a task list line to unordered instead of stacking markers", () => {
    const state = apply("- [ ] item", 0, 0, unorderedListSpec);
    expect(state.doc.toString()).toBe("- item");
  });

  it("converts a * or + bullet line to the standard - marker", () => {
    expect(apply("* item", 0, 0, unorderedListSpec).doc.toString()).toBe("- item");
    expect(apply("+ item", 0, 0, unorderedListSpec).doc.toString()).toBe("- item");
  });

  it("preserves indentation when converting an indented (nested) list item", () => {
    const state = apply("  1. item", 0, 0, unorderedListSpec);
    expect(state.doc.toString()).toBe("  - item");
  });

  it("converts every line of a mixed-type multi-line selection", () => {
    const doc = "1. one\n- [ ] two\n- three";
    const state = apply(doc, 0, doc.length, unorderedListSpec);
    expect(state.doc.toString()).toBe("- one\n- two\n- three");
  });

  it("is idempotent when applied to an already-unordered line", () => {
    const state = apply("- item", 0, 0, unorderedListSpec);
    expect(state.doc.toString()).toBe("- item");
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

  it("places the cursor right after the marker when the line is empty", () => {
    const state = apply("", 0, 0, orderedListSpec);
    expect(state.doc.toString()).toBe("1. ");
    expect(state.selection.main.head).toBe(3);
  });

  it("places the cursor right after the marker on an empty line within a document", () => {
    const doc = "before\n\nafter";
    const state = apply(doc, 7, 7, orderedListSpec); // cursor on the blank middle line
    expect(state.doc.toString()).toBe("before\n1. \nafter");
    expect(state.selection.main.head).toBe(10);
  });

  it("converts an unordered list line to ordered instead of stacking markers", () => {
    const state = apply("- item", 0, 0, orderedListSpec);
    expect(state.doc.toString()).toBe("1. item");
  });

  it("converts a task list line to ordered instead of stacking markers", () => {
    const state = apply("- [ ] item", 0, 0, orderedListSpec);
    expect(state.doc.toString()).toBe("1. item");
  });

  it("re-numbers an already-ordered list rather than doubling the number", () => {
    const doc = "1. one\n1. two\n1. three";
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

  it("places the cursor right after the marker when the line is empty", () => {
    const state = apply("", 0, 0, taskListSpec);
    expect(state.doc.toString()).toBe("- [ ] ");
    expect(state.selection.main.head).toBe(6);
  });

  it("converts an ordered list line to a task instead of stacking markers", () => {
    const state = apply("1. item", 0, 0, taskListSpec);
    expect(state.doc.toString()).toBe("- [ ] item");
  });

  it("converts an unordered list line to a task instead of stacking markers", () => {
    const state = apply("- item", 0, 0, taskListSpec);
    expect(state.doc.toString()).toBe("- [ ] item");
  });

  it("treats an already-checked task item the same as an unchecked one when converting", () => {
    const state = apply("- [x] item", 0, 0, taskListSpec);
    expect(state.doc.toString()).toBe("- [ ] item");
  });
});
