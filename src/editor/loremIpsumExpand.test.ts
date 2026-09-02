import { describe, expect, it } from "vitest";
import { EditorState } from "@codemirror/state";
import { closeBrackets, insertBracket } from "@codemirror/autocomplete";
import { loremIpsumExpand, noCurlyBraceAutoClose } from "./loremIpsumExpand";
import { generateLoremIpsum } from "@shared/loremIpsum";

/** Simulates typing `text` one character at a time at the end of the doc, as a real keystroke would. */
function typeText(state: EditorState, text: string): EditorState {
  let s = state;
  for (const ch of text) {
    const tr = s.update({
      changes: { from: s.doc.length, insert: ch },
      selection: { anchor: s.doc.length + 1 },
      userEvent: "input.type",
    });
    s = tr.state;
  }
  return s;
}

function stateWithExtension(doc = "") {
  return EditorState.create({ doc, extensions: [loremIpsumExpand()] });
}

describe("loremIpsumExpand", () => {
  it("expands {{lorem ipsum}} into a single paragraph the instant }} is typed", () => {
    const state = typeText(stateWithExtension(), "{{lorem ipsum}}");
    expect(state.doc.toString()).toBe(generateLoremIpsum(1));
  });

  it("expands {{lorem ipsum#3}} into three paragraphs", () => {
    const state = typeText(stateWithExtension(), "{{lorem ipsum#3}}");
    expect(state.doc.toString()).toBe(generateLoremIpsum(3));
  });

  it("is case-insensitive", () => {
    const state = typeText(stateWithExtension(), "{{Lorem Ipsum#2}}");
    expect(state.doc.toString()).toBe(generateLoremIpsum(2));
  });

  it("places the cursor at the end of the generated text", () => {
    const state = typeText(stateWithExtension(), "{{lorem ipsum#2}}");
    expect(state.selection.main.head).toBe(state.doc.length);
  });

  it("leaves surrounding text untouched", () => {
    const state = typeText(stateWithExtension("before "), "{{lorem ipsum}} after");
    expect(state.doc.toString()).toBe(`before ${generateLoremIpsum(1)} after`);
  });

  it("does not expand while still typing (before the closing braces)", () => {
    const state = typeText(stateWithExtension(), "{{lorem ipsum#3}");
    expect(state.doc.toString()).toBe("{{lorem ipsum#3}");
  });

  it("does not expand unrelated {{...}} text", () => {
    const state = typeText(stateWithExtension(), "{{something else}}");
    expect(state.doc.toString()).toBe("{{something else}}");
  });

  it("only expands typed input, not programmatic changes", () => {
    const state = stateWithExtension().update({
      changes: { from: 0, insert: "{{lorem ipsum}}" },
    }).state;
    expect(state.doc.toString()).toBe("{{lorem ipsum}}");
  });
});

/** Mimics closeBrackets' real inputHandler: try insertBracket first, fall back to a plain typed insert. */
function typeCharWithBrackets(state: EditorState, ch: string): EditorState {
  const bracketTr = insertBracket(state, ch);
  if (bracketTr) return bracketTr.state;
  const pos = state.selection.main.head;
  return state.update({
    changes: { from: pos, insert: ch },
    selection: { anchor: pos + ch.length },
    userEvent: "input.type",
  }).state;
}

function typeTextWithBrackets(state: EditorState, text: string): EditorState {
  let s = state;
  for (const ch of text) s = typeCharWithBrackets(s, ch);
  return s;
}

describe("noCurlyBraceAutoClose", () => {
  it("excludes { from the closeBrackets bracket list, keeping the rest", () => {
    const state = EditorState.create({ extensions: [noCurlyBraceAutoClose()] });
    const [config] = state.languageDataAt<{ brackets?: string[] }>("closeBrackets", 0);
    expect(config?.brackets).toEqual(["(", "[", "'", '"']);
  });

  it("fixes {{lorem ipsum#N}} expansion when closeBrackets is active", () => {
    const state = typeTextWithBrackets(
      EditorState.create({ extensions: [closeBrackets(), noCurlyBraceAutoClose(), loremIpsumExpand()] }),
      "{{lorem ipsum#3}}"
    );
    expect(state.doc.toString()).toBe(generateLoremIpsum(3));
  });

  it("leaves other bracket auto-closing (e.g. parens) intact", () => {
    const state = typeTextWithBrackets(
      EditorState.create({ extensions: [closeBrackets(), noCurlyBraceAutoClose()] }),
      "("
    );
    expect(state.doc.toString()).toBe("()");
  });

  it("without it, closeBrackets alone auto-inserts an unwanted closing }} (the bug being fixed)", () => {
    const state = typeTextWithBrackets(EditorState.create({ extensions: [closeBrackets()] }), "{{");
    expect(state.doc.toString()).toBe("{{}}");
  });

  it("with it, typing {{ no longer auto-inserts a closing }}", () => {
    const state = typeTextWithBrackets(
      EditorState.create({ extensions: [closeBrackets(), noCurlyBraceAutoClose()] }),
      "{{"
    );
    expect(state.doc.toString()).toBe("{{");
  });
});
