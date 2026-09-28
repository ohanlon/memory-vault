import { describe, expect, it } from "vitest";
import { expandNoteForComposite } from "./compositeExpand";
import type { Note } from "./types";

function makeNote(title: string, content: string): Note {
  return {
    path: `${title}.md`,
    title,
    relativePath: `${title}.md`,
    frontmatter: {},
    tags: [],
    links: [],
    content,
    mtimeMs: 0,
  };
}

function byTitle(notes: Note[]): Map<string, Note> {
  return new Map(notes.map((n) => [n.title.toLowerCase(), n]));
}

describe("expandNoteForComposite", () => {
  it("leaves content with no wikilinks unchanged", () => {
    const note = makeNote("A", "Just plain text.");
    expect(expandNoteForComposite(note, byTitle([note]))).toBe("Just plain text.");
  });

  it("appends a collapsed details block with the linked note's content after a resolved wikilink", () => {
    const a = makeNote("A", "See [[B]] for more.");
    const b = makeNote("B", "B's content.");
    const result = expandNoteForComposite(a, byTitle([a, b]));
    expect(result).toContain("See [[B]]");
    expect(result).toContain('<details class="md-embed"><summary>B</summary>');
    expect(result).toContain("B's content.");
    expect(result).toContain("</details>");
    expect(result.endsWith(" for more.")).toBe(true);
  });

  it("leaves an unresolved (orphan) wikilink untouched with no details block", () => {
    const a = makeNote("A", "See [[Missing]].");
    const result = expandNoteForComposite(a, byTitle([a]));
    expect(result).toBe("See [[Missing]].");
  });

  it("expands links recursively, nesting details blocks", () => {
    const a = makeNote("A", "[[B]]");
    const b = makeNote("B", "[[C]]");
    const c = makeNote("C", "leaf");
    const result = expandNoteForComposite(a, byTitle([a, b, c]));
    expect(result).toContain('<summary>B</summary>');
    expect(result).toContain('<summary>C</summary>');
    expect(result).toContain("leaf");
    // B's block should nest C's block inside it, not sit after it.
    const bOpen = result.indexOf('<summary>B</summary>');
    const cOpen = result.indexOf('<summary>C</summary>');
    const bClose = result.indexOf("</details>", cOpen);
    expect(cOpen).toBeGreaterThan(bOpen);
    expect(bClose).toBeGreaterThan(cOpen);
  });

  it("stops at a direct cycle instead of recursing forever", () => {
    const a = makeNote("A", "[[B]]");
    const b = makeNote("B", "[[A]]");
    const result = expandNoteForComposite(a, byTitle([a, b]));
    expect(result).toContain('<summary>B</summary>');
    expect(result).toContain("circular reference");
    // Only one details block (B's) - A is not re-expanded inside it.
    expect(result.match(/<details/g)).toHaveLength(1);
  });

  it("stops at a self-link", () => {
    const a = makeNote("A", "[[A]]");
    const result = expandNoteForComposite(a, byTitle([a]));
    expect(result).toContain("circular reference");
    expect(result).not.toContain("<details");
  });

  it("stops at an indirect cycle several links deep", () => {
    const a = makeNote("A", "[[B]]");
    const b = makeNote("B", "[[C]]");
    const c = makeNote("C", "[[A]]");
    const result = expandNoteForComposite(a, byTitle([a, b, c]));
    expect(result.match(/<details/g)).toHaveLength(2); // B, then C
    expect(result).toContain("circular reference");
  });

  it("ignores a [[wikilink]] written inside a code span", () => {
    const a = makeNote("A", "Example: `[[B]]` syntax.");
    const b = makeNote("B", "B's content.");
    const result = expandNoteForComposite(a, byTitle([a, b]));
    expect(result).toBe("Example: `[[B]]` syntax.");
  });

  it("expands a link regardless of an alias or header fragment", () => {
    const a = makeNote("A", "[[B#Section|see this]]");
    const b = makeNote("B", "B's content.");
    const result = expandNoteForComposite(a, byTitle([a, b]));
    expect(result).toContain("[[B#Section|see this]]");
    expect(result).toContain("B's content.");
  });

  it("escapes HTML-significant characters in the summary title", () => {
    const a = makeNote("A", "[[<B>]]");
    const b = makeNote("<B>", "content");
    const result = expandNoteForComposite(a, byTitle([a, b]));
    expect(result).toContain("<summary>&lt;B&gt;</summary>");
  });
});
