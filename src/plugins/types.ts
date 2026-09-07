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
// contribution's `matches` predicate accepts the current tab id.
export interface TabKindContribution {
  id: string;
  matches: (tabId: string | null) => boolean;
  component: ComponentType<any>;
}

export interface StatusItemContribution {
  id: string;
  component: ComponentType<any>;
}

// A left-ribbon launcher button. `viewId` is the already-namespaced
// ViewContribution id (e.g. "plugin:hello:main") it should reveal and focus.
export interface RibbonItemContribution {
  id: string;
  title: string;
  icon: string;
  viewId: string;
}

export type CommandHandler = (...args: any[]) => void;
