import type { GraphEdge, GraphModel, GraphNode, Note } from "./types";

/**
 * Builds a graph from a set of notes. Edges come from three sources:
 *  - wikilinks/markdown links: [[Target]] or [text](Target.md) in a note's
 *    body, resolved by matching Target against other notes' titles
 *    (case-insensitive).
 *  - external links: [text](https://...) or mailto: links get their own
 *    external node so they still show up in the graph, distinct from notes
 *    (they never resolve to a note and never gain their own backlinks).
 *  - tags: every tag (from frontmatter `tags:` or an inline #tag in the
 *    body) gets its own hub node ("#tagname"), with an edge from every note
 *    that carries it. Writing #project in one note automatically links it
 *    to every other note tagged "project", without an explicit wikilink.
 */
export function buildGraph(notes: Note[]): GraphModel {
  const byLowerTitle = new Map<string, Note>();
  for (const note of notes) byLowerTitle.set(note.title.toLowerCase(), note);

  const nodes: GraphNode[] = notes.map((n) => ({
    id: n.title,
    path: n.path,
    tags: n.tags,
  }));
  const externalNodeIds = new Set<string>();

  const edges: GraphEdge[] = [];
  const seenWikiEdges = new Set<string>();

  for (const note of notes) {
    const sourceId = note.title;
    for (const link of note.links) {
      if (link.external) {
        const id = link.target;
        if (!externalNodeIds.has(id)) {
          externalNodeIds.add(id);
          nodes.push({ id, path: id, tags: [], external: true });
        }
        const key = `${sourceId}->${id}`;
        if (seenWikiEdges.has(key)) continue;
        seenWikiEdges.add(key);
        edges.push({ source: sourceId, target: id, kind: "external-link" });
        continue;
      }

      const target = byLowerTitle.get(link.target.toLowerCase());
      if (!target || target === note) continue;
      const targetId = target.title;
      const key = `${sourceId}->${targetId}`;
      if (seenWikiEdges.has(key)) continue;
      seenWikiEdges.add(key);
      edges.push({ source: sourceId, target: targetId, kind: "wikilink" });
    }
  }

  const tagNodeIds = new Set<string>();
  for (const note of notes) {
    const sourceId = note.title;
    for (const tag of note.tags) {
      const tagNodeId = `#${tag}`;
      if (!tagNodeIds.has(tagNodeId)) {
        tagNodeIds.add(tagNodeId);
        nodes.push({ id: tagNodeId, path: tagNodeId, tags: [], isTag: true });
      }
      edges.push({ source: sourceId, target: tagNodeId, kind: "tag", tag });
    }
  }

  return { nodes, edges };
}

/** Titles of notes that link to `id` (a graph node id — see GraphNode.id), deduplicated. Excludes self-links. */
export function backlinkTitles(graph: GraphModel, id: string): string[] {
  const unique = new Set(graph.edges.filter((e) => e.target === id && e.source !== id).map((e) => e.source));
  return Array.from(unique);
}
