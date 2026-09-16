import { describe, expect, it } from "vitest";
import { EditorState } from "@codemirror/state";
import { CompletionContext, type CompletionResult } from "@codemirror/autocomplete";
import { wikilinkCompletionSource } from "./wikilinkAutocomplete";
import type { PickableNote } from "./editorContextMenu";

const NOTES: PickableNote[] = [
  { title: "Work Notes" },
  { title: "Work Plan", sourceStack: "Archive" },
  { title: "Personal" },
];

function contextAtEnd(doc: string, explicit = false) {
  const state = EditorState.create({ doc, selection: { anchor: doc.length } });
  return new CompletionContext(state, doc.length, explicit);
}

// The completion source is synchronous in practice; this source never
// returns a Promise, so the cast just narrows past CompletionSource's
// general (possibly-async) signature for the tests below.
function source(currentSourceStack?: string) {
  const src = wikilinkCompletionSource(() => NOTES, () => currentSourceStack);
  return (context: CompletionContext) => src(context) as CompletionResult | null;
}

describe("wikilinkCompletionSource", () => {
  it("returns null when not inside an open [[", () => {
    const result = source()(contextAtEnd("Work Notes"));
    expect(result).toBeNull();
  });

  it("returns null once the wikilink is already closed", () => {
    const result = source()(contextAtEnd("[[Work Notes]]"));
    expect(result).toBeNull();
  });

  it("offers every note immediately after typing [[", () => {
    const result = source()(contextAtEnd("[["));
    expect(result?.options.map((o) => o.label)).toEqual(["Work Notes", "Work Plan", "Personal"]);
  });

  it("filters case-insensitively on the partial title", () => {
    const result = source()(contextAtEnd("[[work"));
    expect(result?.options.map((o) => o.label)).toEqual(["Work Notes", "Work Plan"]);
  });

  it("stops offering once | or # starts an alias/anchor", () => {
    expect(source()(contextAtEnd("[[Work Notes|"))).toBeNull();
    expect(source()(contextAtEnd("[[Work Notes#"))).toBeNull();
  });

  it("applies the same source-stack qualification as the Insert Link menu action", () => {
    const result = source("Main")(contextAtEnd("[[Work Plan"));
    const option = result?.options.find((o) => o.label === "Work Plan");
    expect(option?.apply).toBe("Archive/Work Plan]]");
  });

  it("does not qualify a note from the current stack", () => {
    const result = source("Archive")(contextAtEnd("[[Work Plan"));
    const option = result?.options.find((o) => o.label === "Work Plan");
    expect(option?.apply).toBe("Work Plan]]");
  });

  it("replaces from right after [[, leaving it intact", () => {
    const doc = "[[work";
    const result = source()(contextAtEnd(doc));
    expect(result?.from).toBe(2);
  });
});
