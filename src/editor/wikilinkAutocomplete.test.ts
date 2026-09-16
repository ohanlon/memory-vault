// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { CompletionContext, type Completion, type CompletionResult } from "@codemirror/autocomplete";
import { wikilinkCompletionSource, wikilinkInsertText } from "./wikilinkAutocomplete";
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

describe("wikilinkInsertText", () => {
  it("adds ]] when nothing is already there", () => {
    expect(wikilinkInsertText("Work Notes", "")).toBe("Work Notes]]");
  });

  it("does not double up ]] that closeBrackets already auto-inserted", () => {
    // Regression: closeBrackets auto-inserts "]]" the moment "[[" is typed,
    // so accepting a completion used to add a second "]]" on top of it.
    expect(wikilinkInsertText("Work Notes", "]]")).toBe("Work Notes");
  });

  it("still adds ]] when only unrelated text follows the cursor", () => {
    expect(wikilinkInsertText("Work Notes", "x]")).toBe("Work Notes]]");
  });
});

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

  it("replaces from right after [[, leaving it intact", () => {
    const doc = "[[work";
    const result = source()(contextAtEnd(doc));
    expect(result?.from).toBe(2);
  });

  describe("apply", () => {
    // Simulates closeBrackets already having placed "]]" right after the
    // cursor by the time "[[wor" was typed, exactly as happens for real —
    // this is what triggered the reported "4 ] instead of 2" bug.
    function viewWithAutoClosedBrackets(query: string) {
      const doc = `[[${query}]]`;
      const cursor = 2 + query.length;
      return new EditorView({ state: EditorState.create({ doc, selection: { anchor: cursor } }) });
    }

    // All options from this source use the function form of `apply` (never
    // the plain-string form also allowed by CodeMirror's Completion type).
    function apply(view: EditorView, option: Completion, from: number, to: number) {
      (option.apply as (view: EditorView, completion: Completion, from: number, to: number) => void)(
        view,
        option,
        from,
        to
      );
    }

    it("inserts the note title without duplicating the auto-closed ]]", () => {
      const view = viewWithAutoClosedBrackets("wor");
      const result = source()(new CompletionContext(view.state, 5, false));
      const option = result?.options.find((o) => o.label === "Work Notes");
      apply(view, option!, result!.from, 5);
      expect(view.state.doc.toString()).toBe("[[Work Notes]]");
      expect(view.state.selection.main.head).toBe("[[Work Notes".length);
    });

    it("qualifies with the source stack, same as the Insert Link menu action", () => {
      const view = viewWithAutoClosedBrackets("Work Plan");
      const result = source("Main")(new CompletionContext(view.state, 11, false));
      const option = result?.options.find((o) => o.label === "Work Plan");
      apply(view, option!, result!.from, 11);
      expect(view.state.doc.toString()).toBe("[[Archive/Work Plan]]");
    });

    it("does not qualify a note from the current stack", () => {
      const view = viewWithAutoClosedBrackets("Work Plan");
      const result = source("Archive")(new CompletionContext(view.state, 11, false));
      const option = result?.options.find((o) => o.label === "Work Plan");
      apply(view, option!, result!.from, 11);
      expect(view.state.doc.toString()).toBe("[[Work Plan]]");
    });

    it("still closes the link itself when nothing auto-inserted the brackets", () => {
      const state = EditorState.create({ doc: "[[wor", selection: { anchor: 5 } });
      const view = new EditorView({ state });
      const result = source()(new CompletionContext(view.state, 5, false));
      const option = result?.options.find((o) => o.label === "Work Notes");
      apply(view, option!, result!.from, 5);
      expect(view.state.doc.toString()).toBe("[[Work Notes]]");
    });
  });
});
