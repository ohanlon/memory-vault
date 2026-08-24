import { useState } from "react";
import type { GraphModel, Note, PropertyDef } from "@shared/types";
import { LinksPanel } from "./LinksPanel";
import { TagsPanel } from "./TagsPanel";
import { PropertiesPanel } from "./PropertiesPanel";

interface Props {
  note: Note | null;
  graph: GraphModel;
  schema: PropertyDef[];
  onSelectTitle: (title: string) => void;
  onOpenExternal: (url: string) => void;
  onSaveProperties: (absPath: string, properties: Record<string, unknown>) => void;
  onOpenSchemaManager: () => void;
  regionId?: string;
}

type RightTab = "links" | "tags" | "properties";

const TABS: { id: RightTab; label: string }[] = [
  { id: "links", label: "Links" },
  { id: "tags", label: "Tags" },
  { id: "properties", label: "Properties" },
];

export function RightPanel({
  note,
  graph,
  schema,
  onSelectTitle,
  onOpenExternal,
  onSaveProperties,
  onOpenSchemaManager,
  regionId,
}: Props) {
  const [tab, setTab] = useState<RightTab>("links");
  const activeTitle = note?.title ?? null;

  return (
    <aside className="right-panel" data-region-id={regionId}>
      <div className="right-panel-tabs">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`right-panel-tab-btn${tab === t.id ? " active" : ""}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="right-panel-tab-content">
        {tab === "links" && (
          <LinksPanel
            graph={graph}
            activeTitle={activeTitle}
            onSelectTitle={onSelectTitle}
            onOpenExternal={onOpenExternal}
          />
        )}
        {tab === "tags" && <TagsPanel graph={graph} activeTitle={activeTitle} />}
        {tab === "properties" && (
          <PropertiesPanel
            note={note}
            schema={schema}
            onSaveProperties={onSaveProperties}
            onOpenSchemaManager={onOpenSchemaManager}
          />
        )}
      </div>
    </aside>
  );
}
