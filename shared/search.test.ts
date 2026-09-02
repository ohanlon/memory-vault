import { describe, expect, it } from "vitest";
import { buildSearchRegExp, searchContent } from "./search";

describe("buildSearchRegExp", () => {
  it("returns null for an empty query", () => {
    expect(buildSearchRegExp({ query: "", mode: "plain", wholeWord: false })).toBeNull();
  });

  it("returns null for an invalid regex", () => {
    expect(buildSearchRegExp({ query: "[", mode: "regex", wholeWord: false })).toBeNull();
  });

  it("escapes regex metacharacters in plain mode", () => {
    const re = buildSearchRegExp({ query: "a.b(c)", mode: "plain", wholeWord: false });
    expect(re?.source).toBe("a\\.b\\(c\\)");
  });

  it("wraps the pattern in word boundaries when wholeWord is set", () => {
    const re = buildSearchRegExp({ query: "cat", mode: "plain", wholeWord: true });
    expect(re?.source).toBe("\\bcat\\b");
  });

  it("uses the raw query as a regex in regex mode", () => {
    const re = buildSearchRegExp({ query: "ca+t", mode: "regex", wholeWord: false });
    expect(re?.source).toBe("ca+t");
  });
});

describe("searchContent", () => {
  it("finds matches across multiple lines", () => {
    const matches = searchContent("cat\ndog\ncatalog", {
      query: "cat",
      mode: "plain",
      wholeWord: false,
    });
    expect(matches).toEqual([
      { line: 1, lineText: "cat", start: 0, end: 3 },
      { line: 3, lineText: "catalog", start: 0, end: 3 },
    ]);
  });

  it("respects whole word matching", () => {
    const matches = searchContent("cat\ncatalog", {
      query: "cat",
      mode: "plain",
      wholeWord: true,
    });
    expect(matches).toEqual([{ line: 1, lineText: "cat", start: 0, end: 3 }]);
  });

  it("finds multiple matches on one line", () => {
    const matches = searchContent("cat cat", { query: "cat", mode: "plain", wholeWord: false });
    expect(matches).toEqual([
      { line: 1, lineText: "cat cat", start: 0, end: 3 },
      { line: 1, lineText: "cat cat", start: 4, end: 7 },
    ]);
  });

  it("supports regex mode", () => {
    const matches = searchContent("foo123\nbar", { query: "\\d+", mode: "regex", wholeWord: false });
    expect(matches).toEqual([{ line: 1, lineText: "foo123", start: 3, end: 6 }]);
  });

  it("returns no matches for an invalid regex", () => {
    const matches = searchContent("foo", { query: "[", mode: "regex", wholeWord: false });
    expect(matches).toEqual([]);
  });
});
