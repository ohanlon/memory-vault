import { describe, expect, it } from "vitest";
import { DEFAULT_WORKSPACE_STATE, normalizeWorkspaceState } from "./workspaceState";

const ROOT = "/stacks/work";

describe("normalizeWorkspaceState", () => {
  it("returns defaults for non-object input", () => {
    expect(normalizeWorkspaceState(null, ROOT)).toEqual(DEFAULT_WORKSPACE_STATE);
    expect(normalizeWorkspaceState(undefined, ROOT)).toEqual(DEFAULT_WORKSPACE_STATE);
    expect(normalizeWorkspaceState("nope", ROOT)).toEqual(DEFAULT_WORKSPACE_STATE);
  });

  it("fills in missing fields with defaults", () => {
    expect(normalizeWorkspaceState({ activeTab: "@graph" }, ROOT)).toEqual({
      ...DEFAULT_WORKSPACE_STATE,
      activeTab: "@graph",
    });
  });

  it("keeps a sentinel tab id as a bare string, never root-qualified", () => {
    const state = normalizeWorkspaceState({ openTabs: ["@graph", "@settings"], activeTab: "@graph" }, ROOT);
    expect(state.openTabs).toEqual(["@graph", "@settings"]);
    expect(state.activeTab).toBe("@graph");
  });

  it("round-trips an already root-qualified tab ref unchanged", () => {
    const state = { openTabs: [{ root: ROOT, relativePath: "a.md" }], activeTab: null };
    expect(normalizeWorkspaceState(state, ROOT)).toEqual(state);
  });

  it("drops malformed entries", () => {
    expect(
      normalizeWorkspaceState({ openTabs: [1, null, { root: "x" }, { relativePath: "y" }] }, ROOT).openTabs
    ).toEqual([]);
  });

  it("falls back to null for a malformed activeTab", () => {
    expect(normalizeWorkspaceState({ activeTab: 5 }, ROOT).activeTab).toBeNull();
    expect(normalizeWorkspaceState({ activeTab: { root: "x" } }, ROOT).activeTab).toBeNull();
  });

  describe("migrating the pre-Cairn bare relative-path format", () => {
    it("qualifies a bare relative-path string with fallbackRoot", () => {
      const state = normalizeWorkspaceState({ openTabs: ["a.md", "sub/b.md"], activeTab: "a.md" }, ROOT);
      expect(state.openTabs).toEqual([
        { root: ROOT, relativePath: "a.md" },
        { root: ROOT, relativePath: "sub/b.md" },
      ]);
      expect(state.activeTab).toEqual({ root: ROOT, relativePath: "a.md" });
    });

    it("qualifies with an empty fallbackRoot when none is given (Cairn-scoped file)", () => {
      const state = normalizeWorkspaceState({ openTabs: ["a.md"] }, "");
      expect(state.openTabs).toEqual([{ root: "", relativePath: "a.md" }]);
    });

    it("mixes migrated and already-qualified entries in one list", () => {
      const state = normalizeWorkspaceState(
        { openTabs: ["a.md", { root: "/other", relativePath: "b.md" }, "@graph"] },
        ROOT
      );
      expect(state.openTabs).toEqual([
        { root: ROOT, relativePath: "a.md" },
        { root: "/other", relativePath: "b.md" },
        "@graph",
      ]);
    });
  });
});
