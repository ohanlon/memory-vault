import { describe, expect, it } from "vitest";
import { EditorState, type Transaction } from "@codemirror/state";
import { indentLess, indentMore, indentWithTab } from "@codemirror/commands";
import { markdown } from "@codemirror/lang-markdown";
import { listIndentKeymap } from "./listIndent";

function stateFor(doc: string, cursor: number) {
  return EditorState.create({
    doc,
    selection: { anchor: cursor },
    extensions: [markdown(), listIndentKeymap()],
  });
}

function run(state: EditorState, command: typeof indentMore): EditorState {
  let next = state;
  const dispatch = (tr: Transaction) => {
    next = tr.state;
  };
  const ran = command({ state, dispatch });
  expect(ran).toBe(true);
  return next;
}

describe("listIndentKeymap", () => {
  it("binds Tab to indentMore and Shift-Tab to indentLess", () => {
    expect(indentWithTab.key).toBe("Tab");
    expect(indentWithTab.run).toBe(indentMore);
    expect(indentWithTab.shift).toBe(indentLess);
  });

  it("indents a bullet list item on Tab", () => {
    const doc = "- item";
    const state = run(stateFor(doc, 0), indentMore);
    expect(state.doc.toString()).not.toBe(doc);
    expect(state.doc.toString().trimStart()).toBe("- item");
    expect(state.doc.toString().length).toBeGreaterThan(doc.length);
  });

  it("indents a numbered list item on Tab", () => {
    const doc = "1. item";
    const state = run(stateFor(doc, 0), indentMore);
    expect(state.doc.toString().trimStart()).toBe("1. item");
    expect(state.doc.toString().length).toBeGreaterThan(doc.length);
  });

  it("outdents a previously-indented list item on Shift-Tab", () => {
    const indented = "  - item";
    const state = run(stateFor(indented, 0), indentLess);
    expect(state.doc.toString().length).toBeLessThan(indented.length);
  });
});
