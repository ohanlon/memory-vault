import { describe, expect, it } from "vitest";
import { GRAPH_TAB_ID, SETTINGS_TAB_ID, addTab, reconcileTabs, removeTab, renameTab } from "./tabs";

describe("addTab", () => {
  it("appends a new path", () => {
    expect(addTab(["a"], "b")).toEqual(["a", "b"]);
  });

  it("is a no-op when the path is already open", () => {
    const paths = ["a", "b"];
    expect(addTab(paths, "b")).toEqual(paths);
  });

  it("returns the same array reference when already open", () => {
    const paths = ["a", "b"];
    expect(addTab(paths, "b")).toBe(paths);
  });

  it("opens the first tab from an empty list", () => {
    expect(addTab([], "a")).toEqual(["a"]);
  });
});

describe("removeTab", () => {
  it("removes the given path", () => {
    const { paths } = removeTab(["a", "b", "c"], "b");
    expect(paths).toEqual(["a", "c"]);
  });

  it("falls back to the tab that slid into the closed tab's position", () => {
    // closing "b" (index 1) should activate "c", which is now at index 1
    const { fallback } = removeTab(["a", "b", "c"], "b");
    expect(fallback).toBe("c");
  });

  it("falls back to the new last tab when closing the rightmost tab", () => {
    const { fallback } = removeTab(["a", "b", "c"], "c");
    expect(fallback).toBe("b");
  });

  it("falls back to null when closing the only open tab", () => {
    const { paths, fallback } = removeTab(["a"], "a");
    expect(paths).toEqual([]);
    expect(fallback).toBeNull();
  });

  it("falls back to null when the path is not open", () => {
    const { paths, fallback } = removeTab(["a", "b"], "missing");
    expect(paths).toEqual(["a", "b"]);
    expect(fallback).toBeNull();
  });
});

describe("renameTab", () => {
  it("swaps the path in place, preserving order", () => {
    expect(renameTab(["a", "b", "c"], "b", "b2")).toEqual(["a", "b2", "c"]);
  });

  it("is a no-op when the old path is not open", () => {
    expect(renameTab(["a", "b"], "missing", "x")).toEqual(["a", "b"]);
  });
});

describe("reconcileTabs", () => {
  it("drops paths that no longer exist", () => {
    expect(reconcileTabs(["a", "b", "c"], new Set(["a", "c"]))).toEqual(["a", "c"]);
  });

  it("returns the same array reference when nothing was dropped", () => {
    const paths = ["a", "b"];
    expect(reconcileTabs(paths, new Set(["a", "b", "c"]))).toBe(paths);
  });

  it("drops everything when nothing still exists", () => {
    expect(reconcileTabs(["a", "b"], new Set())).toEqual([]);
  });

  it("never drops the graph tab, even though it isn't a note path", () => {
    expect(reconcileTabs(["a", GRAPH_TAB_ID], new Set(["a"]))).toEqual(["a", GRAPH_TAB_ID]);
    expect(reconcileTabs([GRAPH_TAB_ID], new Set())).toEqual([GRAPH_TAB_ID]);
  });

  it("never drops the settings tab, even though it isn't a note path", () => {
    expect(reconcileTabs(["a", SETTINGS_TAB_ID], new Set(["a"]))).toEqual(["a", SETTINGS_TAB_ID]);
    expect(reconcileTabs([SETTINGS_TAB_ID], new Set())).toEqual([SETTINGS_TAB_ID]);
  });
});
