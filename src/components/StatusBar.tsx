import type { GraphModel, Note } from "@shared/types";
import { pluginRegistry } from "../plugins/registry";

interface Props {
  note: Note | null;
  graph: GraphModel;
  regionId?: string;
}

export function StatusBar({ note, graph, regionId }: Props) {
  if (!note) return <footer className="status-bar" data-region-id={regionId} />;

  return (
    <footer className="status-bar" data-region-id={regionId}>
      {pluginRegistry.getStatusItems().map(({ id, component: Item }) => (
        <Item key={id} note={note} graph={graph} />
      ))}
    </footer>
  );
}
