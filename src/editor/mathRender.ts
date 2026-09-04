import katex from "katex";

const KATEX_OPTIONS = { throwOnError: false, displayMode: true } as const;

/** Matches a $$...$$ block: "$$" alone on a line, content, then "$$" alone on a line. */
export const MATH_BLOCK_RE = /^\$\$[ \t]*\r?\n([\s\S]*?)\r?\n\$\$[ \t]*$/gm;

/**
 * Same shape, anchored to the very start of the string and consuming a
 * trailing newline — for marked's block tokenizer, which requires matches to
 * be a prefix of the remaining source (unlike MATH_BLOCK_RE's whole-document scan).
 */
export const MATH_BLOCK_START_RE = /^\$\$[ \t]*\r?\n([\s\S]*?)\r?\n\$\$[ \t]*(?:\r?\n|$)/;

/** Renders LaTeX to an HTML string, for the markdown preview. */
export function renderMathToString(latex: string): string {
  try {
    return katex.renderToString(latex, KATEX_OPTIONS);
  } catch {
    return "";
  }
}

/** Renders LaTeX into `el` in place, for the live editor's block widget. */
export function renderMathInto(el: HTMLElement, latex: string): void {
  try {
    katex.render(latex, el, KATEX_OPTIONS);
  } catch {
    el.textContent = latex;
  }
}
