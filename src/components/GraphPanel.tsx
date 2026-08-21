import { useEffect, useMemo, useRef, useState } from "react";
import ForceGraph2D, { type ForceGraphMethods } from "react-force-graph-2d";
import type { GraphModel } from "@shared/types";

interface Props {
  graph: GraphModel;
  activeTitle: string | null;
  onSelectTitle: (title: string) => void;
  onOpenExternal: (url: string) => void;
}

const EDGE_COLOR: Record<string, string> = {
  wikilink: "#6c9bd1",
  tag: "#a97bd1",
  "external-link": "#5a9b6e",
};

const TAG_NODE_COLOR = "#a97bd1";
const EXTERNAL_NODE_COLOR = "#5a9b6e";
const NOTE_NODE_COLOR = "#4f8cc9";
const ACTIVE_NODE_COLOR = "#e0a53c";

const MAX_LABEL_LENGTH = 40;

function truncateLabel(label: string): string {
  return label.length > MAX_LABEL_LENGTH ? `${label.slice(0, MAX_LABEL_LENGTH - 1)}…` : label;
}

export function GraphPanel({ graph, activeTitle, onSelectTitle, onOpenExternal }: Props) {
  const fgRef = useRef<ForceGraphMethods | undefined>(undefined);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState({ width: 300, height: 300 });

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

  const data = useMemo(
    () => ({
      nodes: graph.nodes.map((n) => ({ ...n })),
      links: graph.edges.map((e) => ({ ...e })),
    }),
    [graph]
  );

  return (
    <div className="graph-panel" ref={containerRef}>
      <ForceGraph2D
        ref={fgRef}
        width={size.width}
        height={size.height}
        graphData={data}
        nodeId="id"
        nodeLabel="id"
        linkColor={(link: any) => EDGE_COLOR[link.kind] ?? "#888"}
        linkWidth={(link: any) => (link.kind === "wikilink" ? 1.5 : 0.75)}
        nodeColor={(node: any) => {
          if (node.id === activeTitle) return ACTIVE_NODE_COLOR;
          if (node.isTag) return TAG_NODE_COLOR;
          if (node.external) return EXTERNAL_NODE_COLOR;
          return NOTE_NODE_COLOR;
        }}
        nodeCanvasObjectMode={() => "after"}
        nodeCanvasObject={(node: any, ctx, globalScale) => {
          const label = truncateLabel(node.id as string);
          const fontSize = 12 / globalScale;
          ctx.font = `${fontSize}px sans-serif`;
          ctx.fillStyle = "#ccc";
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
  );
}
