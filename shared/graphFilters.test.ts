import { describe, expect, it } from "vitest";
import { DEFAULT_GRAPH_FILTERS, filterGraph } from "./graphFilters";
import type { GraphModel } from "./types";

function graph(): GraphModel {
  return {
    nodes: [
      { id: "A", path: "/A.md", tags: ["work"] },
      { id: "B", path: "/B.md", tags: [] },
      { id: "Lonely", path: "/Lonely.md", tags: [] },
      { id: "#work", path: "#work", tags: [], isTag: true },
      { id: "https://example.com", path: "https://example.com", tags: [], external: true },
    ],
    edges: [
      { source: "A", target: "B", kind: "wikilink" },
      { source: "A", target: "#work", kind: "tag", tag: "work" },
      { source: "A", target: "https://example.com", kind: "external-link" },
    ],
  };
}

describe("filterGraph", () => {
  it("returns everything unchanged with all filters on", () => {
    const g = graph();
    expect(filterGraph(g, DEFAULT_GRAPH_FILTERS)).toEqual(g);
  });

  it("hides tag hub nodes and their edges when tags is off", () => {
    const result = filterGraph(graph(), { ...DEFAULT_GRAPH_FILTERS, tags: false });
    expect(result.nodes.map((n) => n.id)).not.toContain("#work");
    expect(result.edges.some((e) => e.kind === "tag")).toBe(false);
  });

  it("hides external nodes and their edges when externalLinks is off", () => {
    const result = filterGraph(graph(), { ...DEFAULT_GRAPH_FILTERS, externalLinks: false });
    expect(result.nodes.map((n) => n.id)).not.toContain("https://example.com");
    expect(result.edges.some((e) => e.kind === "external-link")).toBe(false);
  });

  it("hides wikilink edges (but keeps the notes) when internalLinks is off", () => {
    const result = filterGraph(graph(), { ...DEFAULT_GRAPH_FILTERS, internalLinks: false });
    expect(result.edges.some((e) => e.kind === "wikilink")).toBe(false);
    expect(result.nodes.map((n) => n.id)).toContain("A");
    expect(result.nodes.map((n) => n.id)).toContain("B");
  });

  it("hides notes with no edges at all when orphaned is off", () => {
    const result = filterGraph(graph(), { ...DEFAULT_GRAPH_FILTERS, orphaned: false });
    expect(result.nodes.map((n) => n.id)).not.toContain("Lonely");
    expect(result.nodes.map((n) => n.id)).toContain("A");
    expect(result.nodes.map((n) => n.id)).toContain("B");
  });

  it("never treats tag hubs or external nodes as orphaned", () => {
    const result = filterGraph(graph(), { ...DEFAULT_GRAPH_FILTERS, orphaned: false });
    expect(result.nodes.map((n) => n.id)).toContain("#work");
    expect(result.nodes.map((n) => n.id)).toContain("https://example.com");
  });
});
