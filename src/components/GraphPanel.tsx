import { useEffect, useMemo, useRef, useState } from "react";
import ForceGraph2D, { type ForceGraphMethods } from "react-force-graph-2d";
import type { GraphModel } from "@shared/types";
import { DEFAULT_GRAPH_FILTERS, filterGraph, type GraphFilters } from "@shared/graphFilters";
import { GraphFilterPanel } from "./GraphFilterPanel";

interface Props {
  graph: GraphModel;
  activeTitle: string | null;
  onSelectTitle: (title: string) => void;
  onOpenExternal: (url: string) => void;
  theme?: "dark" | "light";
}

interface GraphPalette {
  edgeColor: Record<string, string>;
  edgeColorDefault: string;
  tagNode: string;
  externalNode: string;
  noteNode: string;
  orphanNode: string;
  activeNode: string;
  label: string;
}

const DARK_PALETTE: GraphPalette = {
  edgeColor: { wikilink: "#6c9bd1", tag: "#a97bd1", "external-link": "#5a9b6e" },
  edgeColorDefault: "#888",
  tagNode: "#a97bd1",
  externalNode: "#5a9b6e",
  noteNode: "#4f8cc9",
  orphanNode: "#8a8f98",
  activeNode: "#e0a53c",
  label: "#ccc",
};

const LIGHT_PALETTE: GraphPalette = {
  edgeColor: { wikilink: "#2b6cb0", tag: "#7a4fc2", "external-link": "#2f8552" },
  edgeColorDefault: "#9aa1ad",
  tagNode: "#7a4fc2",
  externalNode: "#2f8552",
  noteNode: "#2f6fb0",
  orphanNode: "#6b7280",
  activeNode: "#b8790a",
  label: "#40454f",
};

const MAX_LABEL_LENGTH = 40;

function truncateLabel(label: string): string {
  return label.length > MAX_LABEL_LENGTH ? `${label.slice(0, MAX_LABEL_LENGTH - 1)}…` : label;
}

export function GraphPanel({ graph, activeTitle, onSelectTitle, onOpenExternal, theme = "dark" }: Props) {
  const palette = theme === "light" ? LIGHT_PALETTE : DARK_PALETTE;
  const fgRef = useRef<ForceGraphMethods | undefined>(undefined);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState({ width: 300, height: 300 });
  const [filters, setFilters] = useState<GraphFilters>(DEFAULT_GRAPH_FILTERS);
  const [filterPanelOpen, setFilterPanelOpen] = useState(false);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        setSize({ width: entry.contentRect.width, height: entry.contentRect.height });
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const filteredGraph = useMemo(() => filterGraph(graph, filters), [graph, filters]);

  // Judged against the unfiltered graph, same as the "orphaned" filter itself —
  // hiding e.g. tags shouldn't make an otherwise-connected note look orphaned.
  const connectedIds = useMemo(() => {
    const ids = new Set<string>();
    for (const edge of graph.edges) {
      ids.add(edge.source);
      ids.add(edge.target);
    }
    return ids;
  }, [graph]);

  const data = useMemo(
    () => ({
      nodes: filteredGraph.nodes.map((n) => ({ ...n })),
      links: filteredGraph.edges.map((e) => ({ ...e })),
    }),
    [filteredGraph]
  );

  return (
    <div className="graph-panel">
      <div className="graph-canvas" ref={containerRef}>
        <ForceGraph2D
          ref={fgRef}
          width={size.width}
          height={size.height}
          graphData={data}
          nodeId="id"
          nodeLabel="id"
          linkColor={(link: any) => palette.edgeColor[link.kind] ?? palette.edgeColorDefault}
          linkWidth={(link: any) => (link.kind === "wikilink" ? 1.5 : 0.75)}
          nodeColor={(node: any) => {
            if (node.id === activeTitle) return palette.activeNode;
            if (node.isTag) return palette.tagNode;
            if (node.external) return palette.externalNode;
            if (!connectedIds.has(node.id)) return palette.orphanNode;
            return palette.noteNode;
          }}
          nodeCanvasObjectMode={() => "after"}
          nodeCanvasObject={(node: any, ctx, globalScale) => {
            const label = truncateLabel(node.id as string);
            const fontSize = 12 / globalScale;
            ctx.font = `${fontSize}px sans-serif`;
            ctx.fillStyle = palette.label;
            ctx.textAlign = "center";
            ctx.fillText(label, node.x, node.y + 8);
          }}
          onNodeClick={(node: any) => {
            if (node.isTag) return; // tag hubs have no note to open
            if (node.external) onOpenExternal(node.id);
            else onSelectTitle(node.id);
          }}
        />
      </div>
      <div className="graph-status-bar">
        <button
          className="graph-filter-toggle"
          onClick={() => setFilterPanelOpen((v) => !v)}
          title="Choose what's shown in the graph"
        >
          Filters ▾
        </button>
        {filterPanelOpen && (
          <GraphFilterPanel
            filters={filters}
            onChange={setFilters}
            onClose={() => setFilterPanelOpen(false)}
          />
        )}
      </div>
    </div>
  );
}
