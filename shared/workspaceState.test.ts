import { describe, expect, it } from "vitest";
import { DEFAULT_WORKSPACE_STATE, normalizeWorkspaceState } from "./workspaceState";

describe("normalizeWorkspaceState", () => {
  it("returns defaults for non-object input", () => {
    expect(normalizeWorkspaceState(null)).toEqual(DEFAULT_WORKSPACE_STATE);
    expect(normalizeWorkspaceState(undefined)).toEqual(DEFAULT_WORKSPACE_STATE);
    expect(normalizeWorkspaceState("nope")).toEqual(DEFAULT_WORKSPACE_STATE);
  });

  it("fills in missing fields with defaults", () => {
    expect(normalizeWorkspaceState({ activeTab: "Note.md" })).toEqual({
      ...DEFAULT_WORKSPACE_STATE,
      activeTab: "Note.md",
    });
  });

  it("drops non-string entries from array fields", () => {
    expect(
      normalizeWorkspaceState({ collapsedFolders: ["a", 1, null, "b"], openTabs: [2, "c"] })
    ).toEqual({
      collapsedFolders: ["a", "b"],
      openTabs: ["c"],
      activeTab: null,
    });
  });

  it("falls back to null for a non-string activeTab", () => {
    expect(normalizeWorkspaceState({ activeTab: 5 }).activeTab).toBeNull();
  });

  it("round-trips a fully populated state", () => {
    const state = { collapsedFolders: ["a/b"], openTabs: ["a/b/c.md", "@graph"], activeTab: "@graph" };
    expect(normalizeWorkspaceState(state)).toEqual(state);
  });
});
