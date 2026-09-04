import { describe, expect, it } from "vitest";
import { MATH_BLOCK_RE, renderMathToString } from "./mathRender";

describe("renderMathToString", () => {
  it("renders valid LaTeX to HTML containing KaTeX markup", () => {
    const html = renderMathToString("E = mc^2");
    expect(html).toContain("katex");
    expect(html.length).toBeGreaterThan(0);
  });

  it("does not throw and returns a string for invalid LaTeX", () => {
    expect(() => renderMathToString("\\notarealcommand{")).not.toThrow();
    expect(typeof renderMathToString("\\notarealcommand{")).toBe("string");
  });
});

describe("MATH_BLOCK_RE", () => {
  it("matches a $$...$$ block on its own lines", () => {
    const text = "before\n$$\nE = mc^2\n$$\nafter";
    const matches = Array.from(text.matchAll(MATH_BLOCK_RE));
    expect(matches).toHaveLength(1);
    expect(matches[0][1]).toBe("E = mc^2");
  });

  it("matches multi-line content", () => {
    const text = "$$\na = 1\nb = 2\n$$";
    const matches = Array.from(text.matchAll(MATH_BLOCK_RE));
    expect(matches[0][1]).toBe("a = 1\nb = 2");
  });

  it("does not match inline or unterminated $$", () => {
    expect(Array.from("just $$ text".matchAll(MATH_BLOCK_RE))).toHaveLength(0);
    expect(Array.from("$$\nno closer".matchAll(MATH_BLOCK_RE))).toHaveLength(0);
  });

  it("matches multiple blocks in one document", () => {
    const text = "$$\na\n$$\n\ntext\n\n$$\nb\n$$";
    const matches = Array.from(text.matchAll(MATH_BLOCK_RE));
    expect(matches).toHaveLength(2);
    expect(matches[0][1]).toBe("a");
    expect(matches[1][1]).toBe("b");
  });
});
