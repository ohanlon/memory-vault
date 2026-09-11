import { describe, expect, it } from "vitest";
import { EditorState } from "@codemirror/state";
import { SearchQuery } from "@codemirror/search";
import { computeReplacement, findMatchesInRange, nextMatch, previousMatch } from "./searchInSelection";

function stateFor(doc: string): EditorState {
  return EditorState.create({ doc });
}

describe("computeReplacement", () => {
  it("returns the literal replace text for a plain-string query", () => {
    const query = new SearchQuery({ search: "foo", replace: "bar" });
    expect(computeReplacement(query)).toBe("bar");
  });

  it("unquotes \\n/\\r/\\t in the replace text by default", () => {
    const query = new SearchQuery({ search: "foo", replace: "line1\\nline2" });
    expect(computeReplacement(query)).toBe("line1\nline2");
  });

  it("leaves escapes alone when literal is set", () => {
    const query = new SearchQuery({ search: "foo", replace: "line1\\nline2", literal: true });
    expect(computeReplacement(query)).toBe("line1\\nline2");
  });

  it("substitutes $& with the whole match for a regex query", () => {
    const query = new SearchQuery({ search: "fo+", replace: "[$&]", regexp: true });
    const match = /fo+/.exec("foo") as RegExpExecArray;
    expect(computeReplacement(query, match)).toBe("[foo]");
  });

  it("substitutes numbered capture groups for a regex query", () => {
    const query = new SearchQuery({ search: "(\\w+)@(\\w+)", replace: "$2:$1", regexp: true });
    const match = /(\w+)@(\w+)/.exec("user@host") as RegExpExecArray;
    expect(computeReplacement(query, match)).toBe("host:user");
  });

  it("substitutes $$ with a literal dollar sign", () => {
    const query = new SearchQuery({ search: "foo", replace: "$$$&", regexp: true });
    const match = /foo/.exec("foo") as RegExpExecArray;
    expect(computeReplacement(query, match)).toBe("$foo");
  });

  it("leaves an out-of-range group reference untouched", () => {
    const query = new SearchQuery({ search: "(a)", replace: "$9", regexp: true });
    const match = /(a)/.exec("a") as RegExpExecArray;
    expect(computeReplacement(query, match)).toBe("$9");
  });
});

describe("findMatchesInRange", () => {
  it("finds every plain-string match within the range", () => {
    const state = stateFor("foo bar foo baz foo");
    const query = new SearchQuery({ search: "foo" });
    const matches = findMatchesInRange(query, state, 0, state.doc.length);
    expect(matches.map((m) => [m.from, m.to])).toEqual([
      [0, 3],
      [8, 11],
      [16, 19],
    ]);
  });

  it("excludes matches outside the given range", () => {
    const state = stateFor("foo bar foo baz foo");
    const query = new SearchQuery({ search: "foo" });
    const matches = findMatchesInRange(query, state, 4, 12);
    expect(matches.map((m) => [m.from, m.to])).toEqual([[8, 11]]);
  });

  it("is case-insensitive by default", () => {
    const state = stateFor("Foo foo FOO");
    const query = new SearchQuery({ search: "foo" });
    expect(findMatchesInRange(query, state, 0, state.doc.length)).toHaveLength(3);
  });

  it("respects caseSensitive", () => {
    const state = stateFor("Foo foo FOO");
    const query = new SearchQuery({ search: "foo", caseSensitive: true });
    const matches = findMatchesInRange(query, state, 0, state.doc.length);
    expect(matches.map((m) => [m.from, m.to])).toEqual([[4, 7]]);
  });

  it("respects wholeWord", () => {
    const state = stateFor("cat catalog concat cat");
    const query = new SearchQuery({ search: "cat", wholeWord: true });
    const matches = findMatchesInRange(query, state, 0, state.doc.length);
    expect(matches.map((m) => [m.from, m.to])).toEqual([
      [0, 3],
      [19, 22],
    ]);
  });

  it("finds regex matches and carries the match array", () => {
    const state = stateFor("a1 b22 c333");
    const query = new SearchQuery({ search: "[a-z]\\d+", regexp: true });
    const matches = findMatchesInRange(query, state, 0, state.doc.length);
    expect(matches.map((m) => [m.from, m.to])).toEqual([
      [0, 2],
      [3, 6],
      [7, 11],
    ]);
    expect(matches[1].match?.[0]).toBe("b22");
  });

  it("returns nothing for an invalid regex query", () => {
    const state = stateFor("foo");
    const query = new SearchQuery({ search: "[", regexp: true });
    expect(findMatchesInRange(query, state, 0, state.doc.length)).toEqual([]);
  });
});

describe("nextMatch", () => {
  const matches = [
    { from: 0, to: 3 },
    { from: 8, to: 11 },
    { from: 16, to: 19 },
  ];

  it("returns the first match at or after headPos", () => {
    expect(nextMatch(matches, 5)).toEqual({ from: 8, to: 11 });
  });

  it("returns the match starting exactly at headPos", () => {
    expect(nextMatch(matches, 8)).toEqual({ from: 8, to: 11 });
  });

  it("wraps to the first match when headPos is past the last one", () => {
    expect(nextMatch(matches, 20)).toEqual({ from: 0, to: 3 });
  });

  it("returns null for an empty match list", () => {
    expect(nextMatch([], 0)).toBeNull();
  });
});

describe("previousMatch", () => {
  const matches = [
    { from: 0, to: 3 },
    { from: 8, to: 11 },
    { from: 16, to: 19 },
  ];

  it("returns the last match ending at or before headPos", () => {
    expect(previousMatch(matches, 15)).toEqual({ from: 8, to: 11 });
  });

  it("returns the match ending exactly at headPos", () => {
    expect(previousMatch(matches, 11)).toEqual({ from: 8, to: 11 });
  });

  it("wraps to the last match when headPos is before the first one", () => {
    expect(previousMatch(matches, 0)).toEqual({ from: 16, to: 19 });
  });

  it("returns null for an empty match list", () => {
    expect(previousMatch([], 0)).toBeNull();
  });
});
