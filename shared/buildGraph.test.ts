import { describe, expect, it } from "vitest";
import { buildGraph } from "./buildGraph";
import { parseNote } from "./parseNote";

function note(relativePath: string, raw: string) {
  return parseNote({ path: `/vault/${relativePath}`, relativePath, raw, mtimeMs: 0 });
}

describe("buildGraph", () => {
  it("creates a wikilink edge for a resolvable link", () => {
    const a = note("A.md", "links to [[B]]");
    const b = note("B.md", "no links");
    const graph = buildGraph([a, b]);

    expect(graph.nodes.map((n) => n.id).sort()).toEqual(["A", "B"]);
    expect(graph.edges).toContainEqual({ source: "A", target: "B", kind: "wikilink" });
  });

  it("ignores links to notes that do not exist in the vault", () => {
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
