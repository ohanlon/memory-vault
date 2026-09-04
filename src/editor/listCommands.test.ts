import { describe, expect, it } from "vitest";
import { EditorState } from "@codemirror/state";
import {
  bodySpec,
  boldSpec,
  codeBlockSpec,
  heading1Spec,
  heading2Spec,
  heading3Spec,
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

describe("superscriptSpec", () => {
  it("wraps a selection in ^...^", () => {
    const state = apply("x2", 1, 2, superscriptSpec);
    expect(state.doc.toString()).toBe("x^2^");
    expect(state.selection.main.head).toBe(4);
  });

  it("inserts an empty ^^ with the cursor inside when nothing is selected", () => {
    const state = apply("", 0, 0, superscriptSpec);
    expect(state.doc.toString()).toBe("^^");
    expect(state.selection.main.head).toBe(1);
  });
});

describe("subscriptSpec", () => {
  it("wraps a selection in ~...~", () => {
    const state = apply("H2O", 1, 2, subscriptSpec);
    expect(state.doc.toString()).toBe("H~2~O");
    expect(state.selection.main.head).toBe(4);
  });

  it("inserts an empty ~~ with the cursor inside when nothing is selected", () => {
    const state = apply("", 0, 0, subscriptSpec);
    expect(state.doc.toString()).toBe("~~");
    expect(state.selection.main.head).toBe(1);
  });
});

describe("heading specs", () => {
  it("prefixes the current line with the right number of #s", () => {
    expect(apply("Title", 0, 0, heading1Spec).doc.toString()).toBe("# Title");
    expect(apply("Title", 0, 0, heading2Spec).doc.toString()).toBe("## Title");
    expect(apply("Title", 0, 0, heading3Spec).doc.toString()).toBe("### Title");
  });

  it("places the cursor right after the marker when the line is empty", () => {
    const state = apply("", 0, 0, heading2Spec);
    expect(state.doc.toString()).toBe("## ");
    expect(state.selection.main.head).toBe(3);
  });

  it("converts an existing heading level instead of stacking markers", () => {
    expect(apply("# Title", 0, 0, heading3Spec).doc.toString()).toBe("### Title");
  });

  it("converts an existing blockquote to a heading", () => {
    expect(apply("> Title", 0, 0, heading1Spec).doc.toString()).toBe("# Title");
  });

  it("prefixes every line touched by a multi-line selection", () => {
    const doc = "one\ntwo";
    const state = apply(doc, 0, doc.length, heading1Spec);
    expect(state.doc.toString()).toBe("# one\n# two");
  });
});

describe("quoteSpec", () => {
  it("prefixes the current line with >", () => {
    const state = apply("Title", 0, 0, quoteSpec);
    expect(state.doc.toString()).toBe("> Title");
  });

  it("converts an existing heading to a blockquote", () => {
    expect(apply("### Title", 0, 0, quoteSpec).doc.toString()).toBe("> Title");
  });

  it("places the cursor right after the marker when the line is empty", () => {
    const state = apply("", 0, 0, quoteSpec);
    expect(state.doc.toString()).toBe("> ");
    expect(state.selection.main.head).toBe(2);
  });
});

describe("bodySpec", () => {
  it("strips an existing heading marker", () => {
    expect(apply("## Title", 0, 0, bodySpec).doc.toString()).toBe("Title");
  });

  it("strips an existing blockquote marker", () => {
    expect(apply("> Title", 0, 0, bodySpec).doc.toString()).toBe("Title");
  });

  it("is a no-op on a line with no marker", () => {
    expect(apply("Title", 0, 0, bodySpec).doc.toString()).toBe("Title");
  });

  it("strips markers from every line touched by a multi-line selection", () => {
    const doc = "# one\n> two";
    const state = apply(doc, 0, doc.length, bodySpec);
    expect(state.doc.toString()).toBe("one\ntwo");
  });
});

describe("codeBlockSpec", () => {
  it("wraps the current line in a fenced code block", () => {
    const state = apply("const x = 1;", 0, 0, codeBlockSpec);
    expect(state.doc.toString()).toBe("```\nconst x = 1;\n```");
  });

  it("places the cursor after the closing fence when wrapping a line", () => {
    const state = apply("const x = 1;", 0, 0, codeBlockSpec);
    expect(state.selection.main.head).toBe(state.doc.length);
  });

  it("wraps every line touched by a multi-line selection in one fence", () => {
    const doc = "one\ntwo\nthree";
    const state = apply(doc, 0, doc.length, codeBlockSpec);
    expect(state.doc.toString()).toBe("```\none\ntwo\nthree\n```");
  });

  it("inserts an empty fence with the cursor on the blank line when nothing is selected", () => {
    const state = apply("", 0, 0, codeBlockSpec);
    expect(state.doc.toString()).toBe("```\n\n```");
    expect(state.selection.main.head).toBe(4);
  });

  it("does not strip markdown syntax — it's treated as literal code content", () => {
    const state = apply("# not a heading here", 0, 0, codeBlockSpec);
    expect(state.doc.toString()).toBe("```\n# not a heading here\n```");
  });

  it("opens the fence with the given language as its info string", () => {
    const state = apply("const x = 1;", 0, 0, (s) => codeBlockSpec(s, "javascript"));
    expect(state.doc.toString()).toBe("```javascript\nconst x = 1;\n```");
  });

  it("places the cursor after the closing fence when wrapping a line with a language", () => {
    const state = apply("const x = 1;", 0, 0, (s) => codeBlockSpec(s, "javascript"));
    expect(state.selection.main.head).toBe(state.doc.length);
  });

  it("inserts an empty fence with a language, cursor on the blank line", () => {
    const state = apply("", 0, 0, (s) => codeBlockSpec(s, "python"));
    expect(state.doc.toString()).toBe("```python\n\n```");
    expect(state.selection.main.head).toBe(10); // right after "```python\n"
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
