import { describe, expect, it } from "vitest";
import { resolveRegionViews } from "./regionViews";
import type { ViewContribution } from "./types";

const view = (id: string, exclusive = false): ViewContribution => ({
  id,
  region: "left-sidebar",
  title: id,
  component: () => null,
  exclusive,
});

describe("resolveRegionViews", () => {
  const files = view("files");
  const search = view("search");
  const sync = view("sync", true);

  it("returns null when there are no views", () => {
    expect(resolveRegionViews([], undefined)).toBeNull();
  });

  it("defaults to the first non-exclusive view and keeps exclusive views out of the tab strip", () => {
    const r = resolveRegionViews([sync, files, search], undefined)!;
    expect(r.active.id).toBe("files");
    expect(r.tabbed.map((v) => v.id)).toEqual(["files", "search"]);
    expect(r.bare).toBe(false);
  });

  it("shows a focused exclusive view bare, replacing the others", () => {
    const r = resolveRegionViews([files, search, sync], "sync")!;
    expect(r.active.id).toBe("sync");
    expect(r.bare).toBe(true);
  });

  it("renders a lone view bare, and still shows the strip once an exclusive view is unfocused", () => {
    expect(resolveRegionViews([files], undefined)!.bare).toBe(true);
    expect(resolveRegionViews([files, sync], undefined)!.bare).toBe(true);
    expect(resolveRegionViews([files, search, sync], "search")!.bare).toBe(false);
  });

  it("falls back when the focused id no longer exists (e.g. plugin disabled)", () => {
    expect(resolveRegionViews([files, search], "plugin:gone")!.active.id).toBe("files");
  });
});
