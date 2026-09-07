import type { ComponentType } from "react";

// Regions where exactly one plugin-registered component owns the whole slot.
export type SingleSlotRegion = "title-bar" | "left-ribbon";

// Regions that host a tab strip of one or more registered views.
export type TabbedRegionName = "left-sidebar" | "right-sidebar";

export interface ViewContribution {
  id: string;
  region: TabbedRegionName;
  title: string;
  component: ComponentType<any>;
}

// The editor region picks a renderer for the active tab based on which
// contribution's `matches` predicate accepts the current tab id. `title`
// labels the tab in the tab bar (see App.tsx's openTabItems), since a tab id
// alone (e.g. "@graph") isn't something a user should ever see.
export interface TabKindContribution {
  id: string;
  title: string;
  matches: (tabId: string | null) => boolean;
  component: ComponentType<any>;
}

export interface StatusItemContribution {
  id: string;
  component: ComponentType<any>;
}

// A left-ribbon launcher button. Exactly one of viewId/tabId is set — the
// already-namespaced ViewContribution/TabKindContribution id (e.g.
// "plugin:hello:main") it should reveal/focus or open, respectively.
export interface RibbonItemContribution {
  id: string;
  title: string;
  icon: string;
  viewId?: string;
  tabId?: string;
}

// A file-tree context-menu entry contributed by a plugin. Unlike the other
// contribution types, `pluginId` is always present (not optional bookkeeping)
// since it's needed to route the resulting push message to the right iframe.
export interface ContextMenuItemContribution {
  id: string;
  label: string;
  target: "note" | "folder";
  pluginId: string;
}

export type CommandHandler = (...args: any[]) => void;
