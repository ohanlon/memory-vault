import { describe, expect, it } from "vitest";
import {
  GRAPH_TAB_ID,
  SETTINGS_TAB_ID,
  addTab,
  closeOtherTabs,
  closeTabsLeft,
  closeTabsRight,
  isSentinelTabId,
  reconcileTabs,
  tabRefToTabId,
  removeTab,
  renameTab,
  tabIdToTabRef,
} from "./tabs";

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

describe("closeTabsLeft", () => {
  it("drops every tab before the given path", () => {
    expect(closeTabsLeft(["a", "b", "c"], "c")).toEqual(["c"]);
  });

  it("keeps the given path and everything to its right", () => {
    expect(closeTabsLeft(["a", "b", "c", "d"], "b")).toEqual(["b", "c", "d"]);
  });

  it("is a no-op for the leftmost tab", () => {
    expect(closeTabsLeft(["a", "b"], "a")).toEqual(["a", "b"]);
  });

  it("is a no-op when the path is not open", () => {
    expect(closeTabsLeft(["a", "b"], "missing")).toEqual(["a", "b"]);
  });
});

describe("closeTabsRight", () => {
  it("drops every tab after the given path", () => {
    expect(closeTabsRight(["a", "b", "c"], "a")).toEqual(["a"]);
  });

  it("keeps the given path and everything to its left", () => {
    expect(closeTabsRight(["a", "b", "c", "d"], "c")).toEqual(["a", "b", "c"]);
  });

  it("is a no-op for the rightmost tab", () => {
    expect(closeTabsRight(["a", "b"], "b")).toEqual(["a", "b"]);
  });

  it("is a no-op when the path is not open", () => {
    expect(closeTabsRight(["a", "b"], "missing")).toEqual(["a", "b"]);
  });
});

describe("closeOtherTabs", () => {
  it("keeps only the given path", () => {
    expect(closeOtherTabs(["a", "b", "c"], "b")).toEqual(["b"]);
  });

  it("is a no-op when the path is not open", () => {
    expect(closeOtherTabs(["a", "b"], "missing")).toEqual(["a", "b"]);
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

  it("never drops a plugin tab, even though it isn't a note path", () => {
    const pluginTab = "@plugin:hello:mytab";
    expect(reconcileTabs(["a", pluginTab], new Set(["a"]))).toEqual(["a", pluginTab]);
    expect(reconcileTabs([pluginTab], new Set())).toEqual([pluginTab]);
  });
});

describe("isSentinelTabId", () => {
  it("is true for the graph and settings sentinels", () => {
    expect(isSentinelTabId(GRAPH_TAB_ID)).toBe(true);
    expect(isSentinelTabId(SETTINGS_TAB_ID)).toBe(true);
  });

  it("is true for a plugin tab id", () => {
    expect(isSentinelTabId("@plugin:hello:mytab")).toBe(true);
  });

  it("is false for an absolute note path", () => {
    expect(isSentinelTabId("/vault/a.md")).toBe(false);
    expect(isSentinelTabId("C:\\vault\\a.md")).toBe(false);
  });
});

const notes = [
  { path: "/vault/a.md", relativePath: "a.md" },
  { path: "/vault/sub/b.md", relativePath: "sub\\b.md" },
];

describe("tabIdToTabRef", () => {
  it("resolves an absolute note path to a root-qualified ref", () => {
    expect(tabIdToTabRef("/vault/a.md", notes)).toEqual({ root: "/vault", relativePath: "a.md" });
    expect(tabIdToTabRef("/vault/sub/b.md", notes)).toEqual({ root: "/vault", relativePath: "sub\\b.md" });
  });

  it("passes sentinel tab ids through unchanged", () => {
    expect(tabIdToTabRef(GRAPH_TAB_ID, notes)).toBe(GRAPH_TAB_ID);
    expect(tabIdToTabRef(SETTINGS_TAB_ID, notes)).toBe(SETTINGS_TAB_ID);
    expect(tabIdToTabRef("@plugin:hello:mytab", notes)).toBe("@plugin:hello:mytab");
  });

  it("returns null for a path with no matching note", () => {
    expect(tabIdToTabRef("/vault/missing.md", notes)).toBeNull();
  });
});

describe("tabRefToTabId", () => {
  it("resolves a root-qualified ref to its absolute note path", () => {
    expect(tabRefToTabId({ root: "/vault", relativePath: "a.md" }, notes)).toBe("/vault/a.md");
    expect(tabRefToTabId({ root: "/vault", relativePath: "sub\\b.md" }, notes)).toBe("/vault/sub/b.md");
  });

  it("passes sentinel tab ids through unchanged", () => {
    expect(tabRefToTabId(GRAPH_TAB_ID, notes)).toBe(GRAPH_TAB_ID);
    expect(tabRefToTabId(SETTINGS_TAB_ID, notes)).toBe(SETTINGS_TAB_ID);
    expect(tabRefToTabId("@plugin:hello:mytab", notes)).toBe("@plugin:hello:mytab");
  });

  it("returns null for a ref with no matching note", () => {
    expect(tabRefToTabId({ root: "/vault", relativePath: "missing.md" }, notes)).toBeNull();
  });

  it("disambiguates two stacks that share the same relative path (an open Cairn)", () => {
    const cairnNotes = [
      { path: "/work/a.md", relativePath: "a.md" },
      { path: "/personal/a.md", relativePath: "a.md" },
    ];
    expect(tabRefToTabId({ root: "/work", relativePath: "a.md" }, cairnNotes)).toBe("/work/a.md");
    expect(tabRefToTabId({ root: "/personal", relativePath: "a.md" }, cairnNotes)).toBe("/personal/a.md");
  });
});
