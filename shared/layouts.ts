import layoutsData from "./layouts.json";
import type { Layout, LayoutRegion, LayoutRegionName } from "./types";

export const defaultLayouts: Layout[] = layoutsData.layouts as Layout[];

export function findLayout(layouts: Layout[], name: string): Layout | undefined {
  return layouts.find((l) => l.name === name);
}

export function getRegion(layout: Layout, name: LayoutRegionName): LayoutRegion | undefined {
  return layout.regions.find((r) => r.name === name);
}

export function hasRegion(layout: Layout, name: LayoutRegionName): boolean {
  return getRegion(layout, name) !== undefined;
}
