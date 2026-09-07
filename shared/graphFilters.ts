import type { GraphModel } from "./types";

export interface GraphFilters {
  tags: boolean;
  /** No attachment nodes exist in the graph yet — reserved for when that's added. */
  attachments: boolean;
  /** Notes with no edges at all, in the unfiltered graph. */
  orphaned: boolean;
  externalLinks: boolean;
  internalLinks: boolean;
  /** Notes in a folder the user has marked excluded. Unlike the other filters, this defaults to off. */
  excludedFolders: boolean;
}

export const DEFAULT_GRAPH_FILTERS: GraphFilters = {
  tags: true,
  attachments: true,
  orphaned: true,
  externalLinks: true,
  internalLinks: true,
  excludedFolders: false,
};

/** Applies the given visibility toggles to a graph, dropping edges left dangling by a dropped node. */
export function filterGraph(
  graph: GraphModel,
  filters: GraphFilters,
  excludedNoteIds: Set<string> = new Set()
): GraphModel {
  const connectedIds = new Set<string>();
  for (const edge of graph.edges) {
    connectedIds.add(edge.source);
    connectedIds.add(edge.target);
  }

  const nodes = graph.nodes.filter((node) => {
    if (node.isTag) return filters.tags;
    if (node.external) return filters.externalLinks;
    if (!filters.excludedFolders && excludedNoteIds.has(node.id)) return false;
    if (!filters.orphaned && !connectedIds.has(node.id)) return false;
    return true;
  });
  const nodeIds = new Set(nodes.map((n) => n.id));

  const edges = graph.edges.filter((edge) => {
    if (edge.kind === "tag" && !filters.tags) return false;
    if (edge.kind === "external-link" && !filters.externalLinks) return false;
    if (edge.kind === "wikilink" && !filters.internalLinks) return false;
    return nodeIds.has(edge.source) && nodeIds.has(edge.target);
  });

  return { nodes, edges };
}
