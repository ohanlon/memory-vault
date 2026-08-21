import type { GraphModel } from "@shared/types";

interface Props {
  graph: GraphModel;
  activeTitle: string | null;
  onSelectTitle: (title: string) => void;
  onOpenExternal: (url: string) => void;
}

export function BacklinksPanel({ graph, activeTitle, onSelectTitle, onOpenExternal }: Props) {
  if (!activeTitle) return null;

  // External and tag nodes never appear as a backlink source: edges only
  // point from a note to them, never the other way around.
  const backlinks = graph.edges
    .filter((e) => e.target === activeTitle && e.source !== activeTitle)
    .map((e) => e.source);
  const outgoing = graph.edges.filter((e) => e.source === activeTitle && e.target !== activeTitle);
  const tags = outgoing.filter((e) => e.kind === "tag").map((e) => e.target);
  const forwardLinks = outgoing.filter((e) => e.kind !== "tag").map((e) => e.target);

  const uniq = (arr: string[]) => Array.from(new Set(arr));
  const isExternal = (id: string) => graph.nodes.find((n) => n.id === id)?.external ?? false;

  return (
    <div className="backlinks-panel">
      <div className="backlinks-section">
        <h4>Tags</h4>
        {uniq(tags).length === 0 && <p className="backlinks-empty">No tags</p>}
        <ul className="tag-list">
          {uniq(tags).map((tag) => (
            <li key={tag}>
              <span className="tag-chip">{tag}</span>
            </li>
          ))}
        </ul>
      </div>
      <div className="backlinks-section">
        <h4>Links to here</h4>
        {uniq(backlinks).length === 0 && <p className="backlinks-empty">No backlinks</p>}
        <ul>
          {uniq(backlinks).map((title) => (
            <li key={title}>
              <button onClick={() => onSelectTitle(title)}>{title}</button>
            </li>
          ))}
        </ul>
      </div>
      <div className="backlinks-section">
        <h4>Links from here</h4>
        {uniq(forwardLinks).length === 0 && <p className="backlinks-empty">No outgoing links</p>}
        <ul>
          {uniq(forwardLinks).map((target) => (
            <li key={target}>
              {isExternal(target) ? (
                <button className="external-link" onClick={() => onOpenExternal(target)}>
                  {target}
                </button>
              ) : (
                <button onClick={() => onSelectTitle(target)}>{target}</button>
              )}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
