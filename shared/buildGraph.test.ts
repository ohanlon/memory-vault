import { describe, expect, it } from "vitest";
import { backlinkTitles, buildGraph } from "./buildGraph";
import { parseNote } from "./parseNote";

function note(relativePath: string, raw: string) {
  return parseNote({ path: `/stack/${relativePath}`, relativePath, raw, mtimeMs: 0 });
}

/** A note stamped with a source stack, as buildGraph sees notes merged from an open Cairn. */
function noteIn(sourceStack: string, relativePath: string, raw: string) {
  return {
    ...parseNote({ path: `/${sourceStack}/${relativePath}`, relativePath, raw, mtimeMs: 0 }),
    sourceStack,
  };
}

describe("buildGraph", () => {
  it("creates a wikilink edge for a resolvable link", () => {
    const a = note("A.md", "links to [[B]]");
    const b = note("B.md", "no links");
    const graph = buildGraph([a, b]);

    expect(graph.nodes.map((n) => n.id).sort()).toEqual(["A", "B"]);
    expect(graph.edges).toContainEqual({ source: "A", target: "B", kind: "wikilink" });
  });

  it("ignores links to notes that do not exist in the stack", () => {
    const a = note("A.md", "links to [[Missing]]");
    const graph = buildGraph([a]);
    expect(graph.edges).toEqual([]);
  });

  it("ignores self-links", () => {
    const a = note("A.md", "links to [[A]]");
    const graph = buildGraph([a]);
    expect(graph.edges).toEqual([]);
  });

  it("creates a tag hub node with an edge from each note carrying the tag", () => {
    const a = note("A.md", "---\ntags: [shared]\n---\nno wikilinks");
    const b = note("B.md", "---\ntags: [shared]\n---\nno wikilinks");
    const graph = buildGraph([a, b]);

    expect(graph.nodes).toContainEqual({ id: "#shared", path: "#shared", tags: [], isTag: true });
    expect(graph.edges).toContainEqual({ source: "A", target: "#shared", kind: "tag", tag: "shared" });
    expect(graph.edges).toContainEqual({ source: "B", target: "#shared", kind: "tag", tag: "shared" });
  });

  it("links two notes through the same tag hub when one uses an inline #tag", () => {
    const a = note("A.md", "---\ntags: [shared]\n---\nno wikilinks");
    const b = note("B.md", "mentions #shared inline");
    const graph = buildGraph([a, b]);

    const hubNodes = graph.nodes.filter((n) => n.id === "#shared");
    expect(hubNodes).toHaveLength(1);
    expect(graph.edges).toContainEqual({ source: "A", target: "#shared", kind: "tag", tag: "shared" });
    expect(graph.edges).toContainEqual({ source: "B", target: "#shared", kind: "tag", tag: "shared" });
  });

  it("resolves wikilinks case-insensitively", () => {
    const a = note("A.md", "links to [[b]]");
    const b = note("B.md", "no links");
    const graph = buildGraph([a, b]);
    expect(graph.edges).toContainEqual({ source: "A", target: "B", kind: "wikilink" });
  });

  it("creates an external node and edge for a link to a website", () => {
    const a = note("A.md", "[site](https://example.com)");
    const graph = buildGraph([a]);

    expect(graph.nodes).toContainEqual({
      id: "https://example.com",
      path: "https://example.com",
      tags: [],
      external: true,
    });
    expect(graph.edges).toContainEqual({
      source: "A",
      target: "https://example.com",
      kind: "external-link",
    });
  });

  it("reuses a single external node when multiple notes link to the same URL", () => {
    const a = note("A.md", "[site](https://example.com)");
    const b = note("B.md", "[site](https://example.com)");
    const graph = buildGraph([a, b]);

    const externalNodes = graph.nodes.filter((n) => n.id === "https://example.com");
    expect(externalNodes).toHaveLength(1);
    expect(graph.edges).toContainEqual({
      source: "A",
      target: "https://example.com",
      kind: "external-link",
    });
    expect(graph.edges).toContainEqual({
      source: "B",
      target: "https://example.com",
      kind: "external-link",
    });
  });
});

describe("backlinkTitles", () => {
  it("returns titles of notes that link to the given title", () => {
    const a = note("A.md", "links to [[B]]");
    const b = note("B.md", "no links");
    const graph = buildGraph([a, b]);
    expect(backlinkTitles(graph, "B")).toEqual(["A"]);
  });

  it("returns an empty array when nothing links to the title", () => {
    const a = note("A.md", "no links");
    const graph = buildGraph([a]);
    expect(backlinkTitles(graph, "A")).toEqual([]);
  });

  it("deduplicates multiple links from the same note", () => {
    const a = note("A.md", "[[B]] and [[B|again]]");
    const b = note("B.md", "no links");
    const graph = buildGraph([a, b]);
    expect(backlinkTitles(graph, "B")).toEqual(["A"]);
  });

  it("excludes self-links", () => {
    const a = note("A.md", "links to [[A]]");
    const graph = buildGraph([a]);
    expect(backlinkTitles(graph, "A")).toEqual([]);
  });
});

describe("buildGraph — title collisions across merged stacks", () => {
  it("leaves a unique title's node id as the bare title even with sourceStack set", () => {
    const a = noteIn("Work", "A.md", "no links");
    const graph = buildGraph([a]);
    expect(graph.nodes.map((n) => n.id)).toEqual(["A"]);
  });

  it("qualifies node ids as sourceStack/Title when two notes share a title", () => {
    const a = noteIn("Work", "Notes.md", "no links");
    const b = noteIn("Personal", "Notes.md", "no links");
    const graph = buildGraph([a, b]);
    expect(graph.nodes.map((n) => n.id).sort()).toEqual(["Personal/Notes", "Work/Notes"]);
  });

  it("resolves an unqualified link within the linking note's own stack first", () => {
    const workLinker = noteIn("Work", "Linker.md", "see [[Notes]]");
    const workNotes = noteIn("Work", "Notes.md", "no links");
    const personalNotes = noteIn("Personal", "Notes.md", "no links");
    const graph = buildGraph([workLinker, workNotes, personalNotes]);

    expect(graph.edges).toContainEqual({ source: "Linker", target: "Work/Notes", kind: "wikilink" });
    expect(graph.edges.some((e) => e.target === "Personal/Notes")).toBe(false);
  });

  it("flags an unqualified colliding link as ambiguous when the linking note is in neither stack", () => {
    const thirdStackLinker = noteIn("Other", "Linker.md", "see [[Notes]]");
    const workNotes = noteIn("Work", "Notes.md", "no links");
    const personalNotes = noteIn("Personal", "Notes.md", "no links");
    const graph = buildGraph([thirdStackLinker, workNotes, personalNotes]);

    const edge = graph.edges.find((e) => e.kind === "wikilink");
    expect(edge?.ambiguous).toBe(true);
    expect([workNotes.title, personalNotes.title]).toContain("Notes");
    expect(["Work/Notes", "Personal/Notes"]).toContain(edge?.target);
  });

  it("resolves an explicitly qualified StackName/Title link regardless of collision", () => {
    const linker = noteIn("Other", "Linker.md", "see [[Personal/Notes]]");
    const workNotes = noteIn("Work", "Notes.md", "no links");
    const personalNotes = noteIn("Personal", "Notes.md", "no links");
    const graph = buildGraph([linker, workNotes, personalNotes]);

    expect(graph.edges).toContainEqual({ source: "Linker", target: "Personal/Notes", kind: "wikilink" });
  });

  it("resolves an explicitly qualified link even without a title collision", () => {
    const linker = noteIn("Work", "Linker.md", "see [[Work/Solo]]");
    const solo = noteIn("Work", "Solo.md", "no links");
    const graph = buildGraph([linker, solo]);

    expect(graph.edges).toContainEqual({ source: "Linker", target: "Solo", kind: "wikilink" });
  });
});
