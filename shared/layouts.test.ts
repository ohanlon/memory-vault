import { describe, expect, it } from "vitest";
import { defaultLayouts, findLayout, getRegion, hasRegion } from "./layouts";
import type { Layout } from "./types";

describe("defaultLayouts", () => {
  it("includes a 'default' layout with all six regions", () => {
    const layout = findLayout(defaultLayouts, "default");
    expect(layout).toBeDefined();
    expect(layout!.regions.map((r) => r.name).sort()).toEqual(
      ["editor", "left-ribbon", "left-sidebar", "right-sidebar", "status-bar", "title-bar"].sort()
    );
  });

  it("gives every layout and region a unique, non-empty id", () => {
    const ids = defaultLayouts.flatMap((l) => [l.id, ...l.regions.map((r) => r.id)]);
    expect(ids.every((id) => typeof id === "string" && id.length > 0)).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("findLayout", () => {
  it("finds a layout by name", () => {
    const layouts: Layout[] = [{ id: "1", name: "default", regions: [] }];
    expect(findLayout(layouts, "default")).toBe(layouts[0]);
  });

  it("returns undefined when no layout matches", () => {
    expect(findLayout([], "missing")).toBeUndefined();
  });
});

describe("getRegion / hasRegion", () => {
  const layout: Layout = {
    id: "1",
    name: "default",
    regions: [{ id: "r1", name: "editor" }],
  };

  it("finds a region by name", () => {
    expect(getRegion(layout, "editor")).toEqual({ id: "r1", name: "editor" });
  });

  it("returns undefined when the region is not in the layout", () => {
    expect(getRegion(layout, "status-bar")).toBeUndefined();
  });

  it("hasRegion reflects whether the region is present", () => {
    expect(hasRegion(layout, "editor")).toBe(true);
    expect(hasRegion(layout, "status-bar")).toBe(false);
  });
});
