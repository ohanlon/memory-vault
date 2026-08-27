// Sentinel tab ids for non-note views, which aren't note paths and should
// never collide with one — real note paths are always absolute filesystem
// paths, never a bare "@graph"/"@settings".
export const GRAPH_TAB_ID = "@graph";
export const SETTINGS_TAB_ID = "@settings";

/** Adds a path to the open-tabs list if it isn't already open (no-op otherwise). */
export function addTab(paths: string[], path: string): string[] {
  return paths.includes(path) ? paths : [...paths, path];
}

/**
 * Removes a path from the open-tabs list. `fallback` is which tab should
 * become active if the closed tab was the active one — prefers the tab
 * that slid into its old position (the next tab to the right), falling
 * back to the new last tab if the closed tab was rightmost, or null if it
 * was the only tab open.
 */
export function removeTab(paths: string[], path: string): { paths: string[]; fallback: string | null } {
  const idx = paths.indexOf(path);
  const remaining = paths.filter((p) => p !== path);
  const fallback = idx === -1 ? null : (remaining[idx] ?? remaining[idx - 1] ?? null);
  return { paths: remaining, fallback };
}

/** Swaps an open tab's path in place (e.g. after a rename), preserving position. */
export function renameTab(paths: string[], oldPath: string, newPath: string): string[] {
  return paths.map((p) => (p === oldPath ? newPath : p));
}

/**
 * Drops any open tabs whose path no longer exists (e.g. deleted or renamed
 * externally). Returns the same array reference when nothing changed, so
 * callers can skip a state update.
 */
export function reconcileTabs(paths: string[], existingPaths: ReadonlySet<string>): string[] {
  const filtered = paths.filter(
    (p) => p === GRAPH_TAB_ID || p === SETTINGS_TAB_ID || existingPaths.has(p)
  );
  return filtered.length === paths.length ? paths : filtered;
}
