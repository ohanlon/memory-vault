import { describe, expect, it } from "vitest";
import { MAX_LOREM_IPSUM_PARAGRAPHS, generateLoremIpsum } from "./loremIpsum";

describe("generateLoremIpsum", () => {
  it("generates a single paragraph by default", () => {
    const result = generateLoremIpsum(1);
    expect(result).not.toContain("\n\n");
    expect(result).toMatch(/^Lorem ipsum/);
  });

  it("repeats the paragraph, separated by blank lines, for a given count", () => {
    const result = generateLoremIpsum(3);
    const paragraphs = result.split("\n\n");
    expect(paragraphs).toHaveLength(3);
    expect(paragraphs[0]).toBe(paragraphs[1]);
    expect(paragraphs[1]).toBe(paragraphs[2]);
  });

  it("clamps a count below 1 up to 1", () => {
    expect(generateLoremIpsum(0).split("\n\n")).toHaveLength(1);
    expect(generateLoremIpsum(-5).split("\n\n")).toHaveLength(1);
  });

  it("clamps a very large count down to the max", () => {
    expect(generateLoremIpsum(10000).split("\n\n")).toHaveLength(MAX_LOREM_IPSUM_PARAGRAPHS);
  });

  it("floors a fractional count", () => {
    expect(generateLoremIpsum(2.9).split("\n\n")).toHaveLength(2);
  });
});
