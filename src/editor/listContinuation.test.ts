import { describe, expect, it } from "vitest";
import { EditorState } from "@codemirror/state";
import { markdown } from "@codemirror/lang-markdown";
import { insertNewlineContinueMarkup } from "@codemirror/lang-markdown";
import { loremIpsumExpand, noCurlyBraceAutoClose } from "./loremIpsumExpand";
import { listIndentKeymap } from "./listIndent";

// Exercises the exact extension stack EditorPane assembles (minus the
// CodeMirror-instance-only font theme), so this proves list continuation
// still works once combined with this app's own extensions — not just in
// isolation with @codemirror/lang-markdown alone.
function stateAtEnd(doc: string) {
  return EditorState.create({
    doc,
    selection: { anchor: doc.length },
    extensions: [markdown(), loremIpsumExpand(), noCurlyBraceAutoClose(), listIndentKeymap()],
  });
}

function pressEnter(state: EditorState): EditorState {
  let next = state;
  const ran = insertNewlineContinueMarkup({
    state,
    dispatch: (tr) => {
      next = tr.state;
    },
  });
  expect(ran).toBe(true);
  return next;
}

describe("list continuation (Enter after a list marker)", () => {
  it("continues a bullet list with the same marker", () => {
    const state = pressEnter(stateAtEnd("- first"));
    expect(state.doc.toString()).toBe("- first\n- ");
  });

  it("continues an ordered list, incrementing the number", () => {
    const state = pressEnter(stateAtEnd("1. first"));
    expect(state.doc.toString()).toBe("1. first\n2. ");
  });

  it("continues incrementing across multiple items", () => {
    let state = stateAtEnd("1. first");
    state = pressEnter(state);
    state = EditorState.create({
      doc: state.doc.toString() + "second",
      selection: { anchor: state.doc.length + "second".length },
      extensions: [markdown(), loremIpsumExpand(), noCurlyBraceAutoClose(), listIndentKeymap()],
    });
    state = pressEnter(state);
    expect(state.doc.toString()).toBe("1. first\n2. second\n3. ");
  });

  it("supports *, -, and + bullet markers", () => {
    expect(pressEnter(stateAtEnd("* first")).doc.toString()).toBe("* first\n* ");
    expect(pressEnter(stateAtEnd("+ first")).doc.toString()).toBe("+ first\n+ ");
  });

  it("pressing Enter on an empty list item keeps the marker (starts a loose list) rather than duplicating content", () => {
    const state = pressEnter(stateAtEnd("- first\n- "));
    expect(state.doc.toString()).toBe("- first\n\n- ");
  });
});
