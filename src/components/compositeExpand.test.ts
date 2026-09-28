import { describe, expect, it } from "vitest";
import { createMarked } from "./MarkdownPreview";
import { expandWikilinksInHtml, type ExpandableNote } from "./compositeExpand";

function makeNote(title: string, content: string): ExpandableNote {
  return { title, relativePath: `${title}.md`, content };
}

function render(
  note: ExpandableNote,
  notesByTitle: Map<string, ExpandableNote>,
  enabledLanguageIds: Set<string> = new Set()
) {
  const noteTitles = new Set(Array.from(notesByTitle.keys()));
  const marked = createMarked(note.relativePath, noteTitles, enabledLanguageIds);
  const html = marked.parse(note.content, { async: false }) as string;
  return expandWikilinksInHtml(html, note, notesByTitle, noteTitles, enabledLanguageIds);
}

function byTitle(notes: ExpandableNote[]): Map<string, ExpandableNote> {
  return new Map(notes.map((n) => [n.title.toLowerCase(), n]));
}

describe("expandWikilinksInHtml", () => {
  it("leaves rendered html with no wikilinks unchanged", () => {
    const a = makeNote("A", "Just plain text.");
    const result = render(a, byTitle([a]));
    expect(result.html).toBe("<p>Just plain text.</p>\n");
  });

  it("appends a collapsed details block with the linked note's full content after a resolved wikilink", () => {
    const a = makeNote("A", "See [[B]] for more.");
    const b = makeNote(
      "B",
      "# B heading\n\nFirst paragraph.\n\n## Sub\n\nSecond paragraph.\n\n- one\n- two\n\nLast paragraph at the very end."
    );
    const result = render(a, byTitle([a, b]));
    expect(result.html).toContain('<details class="md-embed"><summary>B</summary>');
    expect(result.html).toContain("<h1>B heading</h1>");
    expect(result.html).toContain("First paragraph.");
    expect(result.html).toContain("<h2>Sub</h2>");
    expect(result.html).toContain("Second paragraph.");
    expect(result.html).toContain("<li>one</li>");
    expect(result.html).toContain("<li>two</li>");
    // The whole note, including its last paragraph, must be present — not just the top part.
    expect(result.html).toContain("Last paragraph at the very end.");
    expect(result.html).toContain("</details>");
    expect(result.html).toContain("for more.");
  });

  it("leaves an unresolved (orphan) wikilink untouched with no details block", () => {
    const a = makeNote("A", "See [[Missing]].");
    const result = render(a, byTitle([a]));
    expect(result.html).not.toContain("<details");
  });

  it("expands links recursively, nesting details blocks", () => {
    const a = makeNote("A", "[[B]]");
    const b = makeNote("B", "[[C]]");
    const c = makeNote("C", "leaf content");
    const result = render(a, byTitle([a, b, c]));
    const bOpen = result.html.indexOf("<summary>B</summary>");
    const cOpen = result.html.indexOf("<summary>C</summary>");
    const bClose = result.html.indexOf("</details>", cOpen);
    expect(bOpen).toBeGreaterThanOrEqual(0);
    expect(cOpen).toBeGreaterThan(bOpen);
    expect(bClose).toBeGreaterThan(cOpen);
    expect(result.html).toContain("leaf content");
  });

  it("stops at a direct cycle instead of recursing forever", () => {
    const a = makeNote("A", "[[B]]");
    const b = makeNote("B", "[[A]]");
    const result = render(a, byTitle([a, b]));
    expect(result.html).toContain("circular reference");
    expect(result.html.match(/<details/g)).toHaveLength(1);
  });

  it("stops at a self-link", () => {
    const a = makeNote("A", "[[A]]");
    const result = render(a, byTitle([a]));
    expect(result.html).toContain("circular reference");
    expect(result.html).not.toContain("<details");
  });

  it("collects needed code-fence languages from expanded notes too", () => {
    const a = makeNote("A", "[[B]]");
    const b = makeNote("B", "```python\nprint(1)\n```\n");
    const result = render(a, byTitle([a, b]), new Set(["python"]));
    expect(result.neededLanguageIds).toContain("python");
  });

  it("escapes HTML-significant characters in the summary title", () => {
    const a = makeNote("A", "[[<B>]]");
    const b = makeNote("<B>", "content");
    const result = render(a, byTitle([a, b]));
    expect(result.html).toContain("<summary>&lt;B&gt;</summary>");
  });
});
