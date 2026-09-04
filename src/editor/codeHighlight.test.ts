import { describe, expect, it } from "vitest";
import { highlightCode } from "./codeHighlight";

describe("highlightCode", () => {
  it("returns null when no language is given", () => {
    expect(highlightCode("const x = 1;", undefined)).toBeNull();
    expect(highlightCode("const x = 1;", "")).toBeNull();
  });

  it("returns null for an unrecognized language", () => {
    expect(highlightCode("some code", "not-a-real-language")).toBeNull();
  });

  it("highlights recognized languages, wrapping tokens in spans", () => {
    const result = highlightCode("const x = 1;", "javascript");
    expect(result).not.toBeNull();
    expect(result?.language).toBe("javascript");
    expect(result?.html).toContain("hljs-keyword");
  });

  it("recognizes common language aliases", () => {
    expect(highlightCode("const x = 1;", "js")).not.toBeNull();
    expect(highlightCode("def f(): pass", "py")).not.toBeNull();
    expect(highlightCode("<div></div>", "html")).not.toBeNull();
  });

  it("is case-insensitive and ignores extra info-string content", () => {
    expect(highlightCode("const x = 1;", "JavaScript")).not.toBeNull();
    expect(highlightCode("const x = 1;", 'js title="example"')?.language).toBe("js");
  });

  it("does not throw on invalid syntax for the chosen language", () => {
    expect(() => highlightCode("this is not valid json {{{", "json")).not.toThrow();
  });
});
