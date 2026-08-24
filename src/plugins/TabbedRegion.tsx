import { useState } from "react";
import type { ViewContribution } from "./types";

interface Props {
  className: string;
  regionId?: string;
  views: ViewContribution[];
  viewProps: Record<string, unknown>;
}

// Renders whichever views are registered for a region. With a single view,
// it renders that view's content directly (no visible tab strip) so a
// region with one contribution looks identical to a hardcoded one; with
// more than one, it adds the tab strip + padded/scrollable content wrapper.
export function TabbedRegion({ className, regionId, views, viewProps }: Props) {
  const [activeId, setActiveId] = useState(views[0]?.id);

  if (views.length === 0) return null;
  const active = views.find((v) => v.id === activeId) ?? views[0];
  const ActiveComponent = active.component;

  if (views.length === 1) {
    return (
      <aside className={className} data-region-id={regionId}>
        <ActiveComponent {...viewProps} />
      </aside>
    );
  }

  return (
    <aside className={className} data-region-id={regionId}>
      <div className="region-tabs">
        {views.map((v) => (
          <button
            key={v.id}
            type="button"
            className={`region-tab-btn${v.id === active.id ? " active" : ""}`}
            onClick={() => setActiveId(v.id)}
          >
            {v.title}
          </button>
        ))}
      </div>
      <div className="region-tab-content">
        <ActiveComponent {...viewProps} />
      </div>
    </aside>
  );
}
