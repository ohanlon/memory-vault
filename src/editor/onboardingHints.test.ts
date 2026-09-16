import { describe, expect, it } from "vitest";
import { detectInlineTag, detectWikilinkStart } from "./onboardingHints";

describe("detectWikilinkStart", () => {
  it("is true right after typing the second [", () => {
    expect(detectWikilinkStart("[[")).toBe(true);
    expect(detectWikilinkStart("Some text [[")).toBe(true);
  });

  it("is false with only one [", () => {
    expect(detectWikilinkStart("[")).toBe(false);
  });

  it("is false once more text follows the [[", () => {
    expect(detectWikilinkStart("[[Note")).toBe(false);
  });

  it("is false with no brackets at all", () => {
    expect(detectWikilinkStart("plain text")).toBe(false);
  });
});

describe("detectInlineTag", () => {
  it("is true right after typing a tag name", () => {
    expect(detectInlineTag("#project")).toBe(true);
    expect(detectInlineTag("Some text #project")).toBe(true);
  });

  it("allows hyphens and nested segments", () => {
    expect(detectInlineTag("#my-project")).toBe(true);
    expect(detectInlineTag("#area/project")).toBe(true);
  });

  it("is false for a bare number", () => {
    expect(detectInlineTag("#123")).toBe(false);
  });

  it("is false for a markdown heading", () => {
    expect(detectInlineTag("# Heading")).toBe(false);
    expect(detectInlineTag("## Heading")).toBe(false);
  });

  it("is false when immediately preceded by a word character (not a real tag boundary)", () => {
    expect(detectInlineTag("issue#123")).toBe(false);
  });

  it("is false with no # at all", () => {
    expect(detectInlineTag("plain text")).toBe(false);
  });
});
