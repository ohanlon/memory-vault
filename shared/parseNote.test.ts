import { describe, expect, it } from "vitest";
import {
  extractInlineTags,
  extractMarkdownLinks,
  extractTags,
  extractWikiLinks,
  parseNote,
  titleFromPath,
} from "./parseNote";

describe("extractWikiLinks", () => {
  it("parses a plain wikilink", () => {
    expect(extractWikiLinks("see [[Other Note]] for more")).toEqual([
      { target: "Other Note", alias: undefined, header: undefined },
    ]);
  });

  it("parses an aliased wikilink", () => {
    expect(extractWikiLinks("[[Other Note|shown text]]")).toEqual([
      { target: "Other Note", alias: "shown text", header: undefined },
    ]);
  });

  it("parses a header-anchored wikilink", () => {
    expect(extractWikiLinks("[[Other Note#Section]]")).toEqual([
      { target: "Other Note", alias: undefined, header: "Section" },
    ]);
  });

  it("parses multiple links in one document", () => {
    const links = extractWikiLinks("[[A]] and [[B|bee]] and [[C#h]]");
    expect(links.map((l) => l.target)).toEqual(["A", "B", "C"]);
  });

  it("returns an empty array when there are no links", () => {
    expect(extractWikiLinks("no links here")).toEqual([]);
  });

  it("does not treat a wikilink inside inline code as a real link", () => {
    expect(extractWikiLinks("use `[[Note]]` syntax to link")).toEqual([]);
  });

  it("does not treat a wikilink inside a fenced code block as a real link", () => {
    expect(extractWikiLinks("```\n[[Note]]\n```")).toEqual([]);
  });

  it("still parses a real wikilink outside of code spans on the same line", () => {
    expect(extractWikiLinks("see `code` and [[Real]]")).toEqual([
      { target: "Real", alias: undefined, header: undefined },
    ]);
  });
});

describe("extractMarkdownLinks", () => {
  it("parses a basic markdown link to a note", () => {
    expect(extractMarkdownLinks("[Bobby](Linked.md)")).toEqual([
      { target: "Linked", alias: "Bobby", header: undefined },
    ]);
  });

  it("resolves a relative directory path down to the note title", () => {
    expect(extractMarkdownLinks("[text](folder/Sub Note.md)")).toEqual([
      { target: "Sub Note", alias: "text", header: undefined },
    ]);
  });

  it("decodes URL-encoded spaces in the path", () => {
    expect(extractMarkdownLinks("[text](My%20Note.md)")).toEqual([
      { target: "My Note", alias: "text", header: undefined },
    ]);
  });

  it("parses a header anchor", () => {
    expect(extractMarkdownLinks("[text](Linked.md#Section)")).toEqual([
      { target: "Linked", alias: "text", header: "Section" },
    ]);
  });

  it("drops an optional title suffix", () => {
    expect(extractMarkdownLinks('[text](Linked.md "a title")')).toEqual([
      { target: "Linked", alias: "text", header: undefined },
    ]);
  });

  it("omits alias when link text matches the resolved title", () => {
    expect(extractMarkdownLinks("[Linked](Linked.md)")).toEqual([
      { target: "Linked", alias: undefined, header: undefined },
    ]);
  });

  it("treats http(s) links as external links, not stack links", () => {
    expect(extractMarkdownLinks("[site](https://example.com)")).toEqual([
      { target: "https://example.com", alias: "site", header: undefined, external: true },
    ]);
    expect(extractMarkdownLinks("[home](http://example.com)")).toEqual([
      { target: "http://example.com", alias: "home", header: undefined, external: true },
    ]);
  });

  it("treats mailto links as external links", () => {
    expect(extractMarkdownLinks("[mail](mailto:a@b.com)")).toEqual([
      { target: "mailto:a@b.com", alias: "mail", header: undefined, external: true },
    ]);
  });

  it("omits alias for external links when link text is empty", () => {
    expect(extractMarkdownLinks("[](https://example.com)")).toEqual([
      { target: "https://example.com", alias: undefined, header: undefined, external: true },
    ]);
  });

  it("ignores other URL schemes entirely (not shown as external, not resolved as a note)", () => {
    expect(extractMarkdownLinks("[run](javascript:alert(1))")).toEqual([]);
    expect(extractMarkdownLinks("[data](data:text/plain,hi)")).toEqual([]);
  });

  it("ignores pure in-page anchors", () => {
    expect(extractMarkdownLinks("[jump](#section)")).toEqual([]);
  });

  it("ignores non-markdown file links", () => {
    expect(extractMarkdownLinks("[img](photo.png)")).toEqual([]);
  });

  it("ignores image embeds", () => {
    expect(extractMarkdownLinks("![alt](Linked.md)")).toEqual([]);
  });

  it("returns an empty array when there are no links", () => {
    expect(extractMarkdownLinks("no links here")).toEqual([]);
  });

  it("does not treat a markdown link inside inline code as a real link", () => {
    expect(extractMarkdownLinks("use `[text](Note.md)` syntax")).toEqual([]);
  });
});

describe("extractInlineTags", () => {
  it("does not treat a hashtag inside inline code as a real tag", () => {
    expect(extractInlineTags("write `#project` to tag a note")).toEqual([]);
  });

  it("does not treat a hashtag inside a fenced code block as a real tag", () => {
    expect(extractInlineTags("```\n#project\n```")).toEqual([]);
  });

  it("parses a bare hashtag in the middle of a sentence", () => {
    expect(extractInlineTags("this note is about #project work")).toEqual(["project"]);
  });

  it("parses a nested tag", () => {
    expect(extractInlineTags("#project/urgent")).toEqual(["project/urgent"]);
  });

  it("parses multiple distinct tags and dedupes repeats", () => {
    expect(extractInlineTags("#a #b #a")).toEqual(["a", "b"]);
  });

  it("does not treat a level-1 markdown heading as a tag", () => {
    expect(extractInlineTags("# Heading")).toEqual([]);
  });

  it("does not treat a level-2 markdown heading as a tag", () => {
    expect(extractInlineTags("## Subheading")).toEqual([]);
  });

  it("does not treat a bare number as a tag", () => {
    expect(extractInlineTags("see issue #123")).toEqual([]);
  });

  it("does not pick up a wikilink header anchor as a tag", () => {
    expect(extractInlineTags("[[Note#Header]]")).toEqual([]);
  });

  it("does not pick up a markdown link header anchor as a tag", () => {
    expect(extractInlineTags("[text](Note.md#Header)")).toEqual([]);
  });

  it("returns an empty array when there are no tags", () => {
    expect(extractInlineTags("no tags here")).toEqual([]);
  });
});

describe("extractTags", () => {
  it("reads a yaml array of tags", () => {
    expect(extractTags({ tags: ["a", "b"] })).toEqual(["a", "b"]);
  });

  it("reads a comma-separated string of tags", () => {
    expect(extractTags({ tags: "a, b, c" })).toEqual(["a", "b", "c"]);
  });

  it("returns empty array when tags is missing", () => {
    expect(extractTags({})).toEqual([]);
  });

  it("returns empty array when tags is an empty string", () => {
    expect(extractTags({ tags: "" })).toEqual([]);
  });
});

describe("titleFromPath", () => {
  it("strips the .md extension and directory", () => {
    expect(titleFromPath("folder/Sub Note.md")).toBe("Sub Note");
  });

  it("handles windows-style separators", () => {
    expect(titleFromPath("folder\\Sub Note.md")).toBe("Sub Note");
  });
});

describe("parseNote", () => {
  it("extracts frontmatter, tags, and links from a full note", () => {
    const raw = `---\ntags: [project, active]\nowner: pete\n---\n\nSee [[Related Note]] and [[Another|alias]].\n`;
    const note = parseNote({
      path: "/stack/Note.md",
      relativePath: "Note.md",
      raw,
      mtimeMs: 123,
    });

    expect(note.title).toBe("Note");
    expect(note.frontmatter.owner).toBe("pete");
    expect(note.tags).toEqual(["project", "active"]);
    expect(note.links.map((l) => l.target)).toEqual(["Related Note", "Another"]);
    expect(note.content).toContain("See [[Related Note]]");
  });

  it("combines wikilinks and markdown links into a single links array", () => {
    const raw = `See [[WikiTarget]] and [Bobby](Linked.md).`;
    const note = parseNote({
      path: "/stack/Note.md",
      relativePath: "Note.md",
      raw,
      mtimeMs: 1,
    });

    expect(note.links).toEqual([
      { target: "WikiTarget", alias: undefined, header: undefined },
      { target: "Linked", alias: "Bobby", header: undefined },
    ]);
  });

  it("merges frontmatter tags and inline #tags, deduping overlaps", () => {
    const raw = `---\ntags: [project]\n---\n\nAlso tagged #urgent and #project again.\n`;
    const note = parseNote({
      path: "/stack/Note.md",
      relativePath: "Note.md",
      raw,
      mtimeMs: 1,
    });

    expect(note.tags.sort()).toEqual(["project", "urgent"]);
  });

  it("handles a note with no frontmatter", () => {
    const raw = `# Just a heading\n\nNo frontmatter, no links.\n`;
    const note = parseNote({
      path: "/stack/Plain.md",
      relativePath: "Plain.md",
      raw,
      mtimeMs: 1,
    });

    expect(note.frontmatter).toEqual({});
    expect(note.tags).toEqual([]);
    expect(note.links).toEqual([]);
  });
});
