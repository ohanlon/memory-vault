// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import type { Note } from "@shared/types";
import { buildHtmlExport, buildMarkdownExport } from "./vaultExport";

function makeNote(relativePath: string, content: string): Note {
  return {
    path: relativePath,
    title: relativePath.replace(/\.md$/, ""),
    relativePath,
    frontmatter: {},
    tags: [],
    links: [],
    content,
    mtimeMs: 0,
  };
}

describe("buildMarkdownExport", () => {
  it("concatenates every note with a heading and a separator", () => {
    const notes = [makeNote("B.md", "second"), makeNote("A.md", "first")];

    const result = buildMarkdownExport(notes);

    expect(result).toBe("# A\n\nfirst\n\n---\n\n# B\n\nsecond\n");
  });

  it("sorts notes alphabetically by title regardless of input order", () => {
    const notes = [makeNote("Zebra.md", "z"), makeNote("Apple.md", "a")];

    const result = buildMarkdownExport(notes);

    expect(result.indexOf("# Apple")).toBeLessThan(result.indexOf("# Zebra"));
  });
});

describe("buildHtmlExport", () => {
  it("renders a table of contents and one article per note", async () => {
    const notes = [makeNote("A.md", "hello"), makeNote("B.md", "world")];

    const html = await buildHtmlExport("/root", notes, [], async () => ({}));

    expect(html).toContain('<nav class="toc">');
    expect(html).toContain('id="a"');
    expect(html).toContain('id="b"');
    expect(html).toContain("hello");
    expect(html).toContain("world");
  });

  it("rewrites a wikilink to another exported note into an in-document anchor", async () => {
    const notes = [makeNote("A.md", "see [[B]]"), makeNote("B.md", "content")];

    const html = await buildHtmlExport("/root", notes, [], async () => ({}));

    expect(html).toContain('href="#b"');
  });

  it("inlines an attachment image as a data: URL", async () => {
    const notes = [makeNote("A.md", "![alt](attachments/foo.png)")];

    const html = await buildHtmlExport("/root", notes, [], async (root, paths) => {
      expect(root).toBe("/root");
      expect(paths).toEqual(["attachments/foo.png"]);
      return { "attachments/foo.png": "data:image/png;base64,AAAA" };
    });

    expect(html).toContain('src="data:image/png;base64,AAAA"');
  });

  it("leaves an image reference unresolved when the data URL lookup omits it", async () => {
    const notes = [makeNote("A.md", "![alt](attachments/missing.png)")];

    const html = await buildHtmlExport("/root", notes, [], async () => ({}));

    expect(html).toContain('src="attachments/missing.png"');
  });
});
