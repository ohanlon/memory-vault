import type { GraphModel } from "@shared/types";

interface Props {
  graph: GraphModel;
  activeTitle: string | null;
}

export function TagsPanel({ graph, activeTitle }: Props) {
  if (!activeTitle) return <p className="backlinks-empty">Select a note to see its tags</p>;

  const tags = graph.edges
    .filter((e) => e.source === activeTitle && e.kind === "tag")
    .map((e) => e.target);
  const uniqTags = Array.from(new Set(tags));

  if (uniqTags.length === 0) return <p className="backlinks-empty">No tags</p>;

  return (
    <ul className="tag-list tag-list-vertical">
      {uniqTags.map((tag) => (
        <li key={tag}>
          <span className="tag-chip">{tag}</span>
        </li>
      ))}
    </ul>
  );
}
