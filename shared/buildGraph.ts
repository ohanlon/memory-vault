import type { GraphEdge, GraphModel, GraphNode, Note } from "./types";

/**
 * Builds a graph from a set of notes. Edges come from three sources:
 *  - wikilinks/markdown links: [[Target]] or [text](Target.md) in a note's
 *    body, resolved by matching Target against other notes' titles
 *    (case-insensitive).
 *  - external links: [text](https://...) or mailto: links get their own
 *    external node so they still show up in the graph, distinct from vault
 *    notes (they never resolve to a note and never gain their own backlinks).
 *  - tags: every tag (from frontmatter `tags:` or an inline #tag in the
 *    body) gets its own hub node ("#tagname"), with an edge from every note
 *    that carries it. Writing #project in one note automatically links it
 *    to every other note tagged "project", without an explicit wikilink.
 */
export function buildGraph(notes: Note[]): GraphModel {
  const byTitle = new Map<string, Note>();
  for (const note of notes) {
    byTitle.set(note.title.toLowerCase(), note);
  }

  const nodes: GraphNode[] = notes.map((n) => ({
    id: n.title,
    path: n.path,
    tags: n.tags,
  }));
  const externalNodeIds = new Set<string>();

  const edges: GraphEdge[] = [];
  const seenWikiEdges = new Set<string>();

  for (const note of notes) {
    for (const link of note.links) {
      if (link.external) {
        const id = link.target;
        if (!externalNodeIds.has(id)) {
          externalNodeIds.add(id);
          nodes.push({ id, path: id, tags: [], external: true });
        }
        const key = `${note.title}->${id}`;
        if (seenWikiEdges.has(key)) continue;
        seenWikiEdges.add(key);
        edges.push({ source: note.title, target: id, kind: "external-link" });
        continue;
      }

      const target = byTitle.get(link.target.toLowerCase());
      if (!target || target.title === note.title) continue;
      const key = `${note.title}->${target.title}`;
      if (seenWikiEdges.has(key)) continue;
      seenWikiEdges.add(key);
      edges.push({ source: note.title, target: target.title, kind: "wikilink" });
    }
  }

  const tagNodeIds = new Set<string>();
  for (const note of notes) {
    for (const tag of note.tags) {
      const tagNodeId = `#${tag}`;
      if (!tagNodeIds.has(tagNodeId)) {
        tagNodeIds.add(tagNodeId);
        nodes.push({ id: tagNodeId, path: tagNodeId, tags: [], isTag: true });
      }
      edges.push({ source: note.title, target: tagNodeId, kind: "tag", tag });
    }
  }

  return { nodes, edges };
}

/** Titles of notes that link to `title`, deduplicated. Excludes self-links. */
export function backlinkTitles(graph: GraphModel, title: string): string[] {
  const unique = new Set(
    graph.edges.filter((e) => e.target === title && e.source !== title).map((e) => e.source)
  );
  return Array.from(unique);
}
