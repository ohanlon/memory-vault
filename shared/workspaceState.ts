import type { WorkspaceState, WorkspaceTabRef } from "./types";

export const DEFAULT_WORKSPACE_STATE: WorkspaceState = {
  openTabs: [],
  activeTab: null,
};

// Mirrors isSentinelTabId in src/stack/tabs.ts — duplicated rather than
// imported since shared/ has no dependency on the renderer.
function isSentinelId(id: string): boolean {
  return id.startsWith("@");
}

function isTabRefObject(v: unknown): v is { root: string; relativePath: string } {
  return (
    !!v &&
    typeof v === "object" &&
    typeof (v as Record<string, unknown>).root === "string" &&
    typeof (v as Record<string, unknown>).relativePath === "string"
  );
}

/** Migrates a pre-Cairn bare relative-path string (implicitly relative to
 *  the single stack being loaded) by qualifying it with `fallbackRoot`. A
 *  bare sentinel id (e.g. "@graph") is never root-qualified. */
function normalizeTabRef(value: unknown, fallbackRoot: string): WorkspaceTabRef | null {
  if (typeof value === "string") {
    return isSentinelId(value) ? value : { root: fallbackRoot, relativePath: value };
  }
  if (isTabRefObject(value)) return value;
  return null;
}

function normalizeTabRefs(value: unknown, fallbackRoot: string): WorkspaceTabRef[] {
  if (!Array.isArray(value)) return [];
  const result: WorkspaceTabRef[] = [];
  for (const entry of value) {
    const ref = normalizeTabRef(entry, fallbackRoot);
    if (ref !== null) result.push(ref);
  }
  return result;
}

/**
 * Fills in missing/invalid fields with defaults. `fallbackRoot` qualifies
 * any pre-Cairn bare-string tab entries found in an old workspace.json —
 * pass the stack root being loaded for a single-stack session, or "" for a
 * Cairn-scoped workspace file (which never existed in the old format, so
 * migration there is a no-op in practice).
 */
export function normalizeWorkspaceState(value: unknown, fallbackRoot: string): WorkspaceState {
  const raw = (value && typeof value === "object" ? value : {}) as Partial<WorkspaceState>;
  return {
    openTabs: normalizeTabRefs(raw.openTabs, fallbackRoot),
    activeTab: normalizeTabRef(raw.activeTab, fallbackRoot),
  };
}
