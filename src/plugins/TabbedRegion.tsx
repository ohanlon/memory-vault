import { useSyncExternalStore } from "react";
import { focusView, getFocusedView, subscribeFocusedView } from "./focusedViewStore";
import type { TabbedRegionName, ViewContribution } from "./types";

interface Props {
  className: string;
  /** Semantic region name (e.g. "left-sidebar") — the key used to look up/set the focused view, distinct from `regionId`'s display/layout id. */
  region: TabbedRegionName;
  regionId?: string;
  views: ViewContribution[];
  viewProps: Record<string, unknown>;
}

// Renders whichever views are registered for a region. With a single view,
// it renders that view's content directly (no visible tab strip) so a
// region with one contribution looks identical to a hardcoded one; with
// more than one, it adds the tab strip + padded/scrollable content wrapper.
// Which view is active lives in focusedViewStore (not local state) so a
// left-ribbon launcher button elsewhere in the tree can focus a view here.
export function TabbedRegion({ className, region, regionId, views, viewProps }: Props) {
  const focusedId = useSyncExternalStore(subscribeFocusedView, () => getFocusedView(region));

  if (views.length === 0) return null;
  const active = views.find((v) => v.id === focusedId) ?? views[0];
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
            onClick={() => focusView(region, v.id)}
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
