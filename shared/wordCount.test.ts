import { describe, expect, it } from "vitest";
import { countCharacters, countWords } from "./wordCount";

describe("countWords", () => {
  it("counts words separated by single spaces", () => {
    expect(countWords("one two three")).toBe(3);
  });

  it("returns 0 for an empty string", () => {
    expect(countWords("")).toBe(0);
  });

  it("returns 0 for whitespace-only content", () => {
    expect(countWords("   \n\t  ")).toBe(0);
  });

  it("collapses multiple spaces and newlines between words", () => {
    expect(countWords("one   two\n\nthree")).toBe(3);
  });

  it("ignores leading/trailing whitespace", () => {
    expect(countWords("  one two  ")).toBe(2);
  });
});

describe("countCharacters", () => {
  it("counts the raw character length", () => {
    expect(countCharacters("abc")).toBe(3);
  });

  it("returns 0 for an empty string", () => {
    expect(countCharacters("")).toBe(0);
  });

  it("counts whitespace characters", () => {
    expect(countCharacters("a b")).toBe(3);
  });
});
