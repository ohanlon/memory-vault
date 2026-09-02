import type { WorkspaceState } from "./types";

export const DEFAULT_WORKSPACE_STATE: WorkspaceState = {
  collapsedFolders: [],
  openTabs: [],
  activeTab: null,
};

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}

/** Fills in missing/invalid fields with defaults. */
export function normalizeWorkspaceState(value: unknown): WorkspaceState {
  const raw = (value && typeof value === "object" ? value : {}) as Partial<WorkspaceState>;
  return {
    collapsedFolders: stringArray(raw.collapsedFolders),
    openTabs: stringArray(raw.openTabs),
    activeTab: typeof raw.activeTab === "string" ? raw.activeTab : null,
  };
}
