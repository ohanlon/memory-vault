// Sentinel tab ids for non-note views, which aren't note paths and should
// never collide with one — real note paths are always absolute filesystem
// paths, never a bare "@graph"/"@settings".
export const GRAPH_TAB_ID = "@graph";
export const SETTINGS_TAB_ID = "@settings";

// General test for any non-note tab id (Graph, Settings, or a plugin tab —
// see PluginTab in shared/types.ts, whose ids take the form
// "@plugin:<pluginId>:<tabId>"). All such sentinels start with "@", which a
// real absolute filesystem note path never does.
export function isSentinelTabId(id: string): boolean {
  return id.startsWith("@");
}

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

/** Closes every open tab to the left of `path`, keeping `path` and everything to its right. */
export function closeTabsLeft(paths: string[], path: string): string[] {
  const idx = paths.indexOf(path);
  return idx === -1 ? paths : paths.slice(idx);
}

/** Closes every open tab to the right of `path`, keeping `path` and everything to its left. */
export function closeTabsRight(paths: string[], path: string): string[] {
  const idx = paths.indexOf(path);
  return idx === -1 ? paths : paths.slice(0, idx + 1);
}

/** Closes every open tab except `path`. */
export function closeOtherTabs(paths: string[], path: string): string[] {
  return paths.includes(path) ? [path] : paths;
}

/**
 * Drops any open tabs whose path no longer exists (e.g. deleted or renamed
 * externally). Returns the same array reference when nothing changed, so
 * callers can skip a state update.
 */
export function reconcileTabs(paths: string[], existingPaths: ReadonlySet<string>): string[] {
  const filtered = paths.filter((p) => isSentinelTabId(p) || existingPaths.has(p));
  return filtered.length === paths.length ? paths : filtered;
}

interface NoteLike {
  path: string;
  relativePath: string;
}

type TabRef = string | { root: string; relativePath: string };

/** A note's own stack root, derived from its absolute path and stack-relative path. */
function deriveNoteRoot(note: NoteLike): string {
  return note.path.slice(0, note.path.length - note.relativePath.length).replace(/[\\/]+$/, "");
}

function belongsToRoot(note: NoteLike, root: string): boolean {
  return note.path === root || note.path.startsWith(`${root}/`) || note.path.startsWith(`${root}\\`);
}

/**
 * Converts an open-tab id (an absolute note path or a sentinel id) to the
 * root-qualified form persisted in workspace state, so saved state stays
 * valid if the vault is relocated and resolves to the right note even when
 * more than one open stack shares a relative path (an open Cairn). Returns
 * null when the note can't be found.
 */
export function tabIdToTabRef(tabId: string, notes: NoteLike[]): TabRef | null {
  if (isSentinelTabId(tabId)) return tabId;
  const note = notes.find((n) => n.path === tabId);
  return note ? { root: deriveNoteRoot(note), relativePath: note.relativePath } : null;
}

/** The inverse of tabIdToTabRef — resolves persisted state back to a usable tab id. */
export function tabRefToTabId(ref: TabRef, notes: NoteLike[]): string | null {
  if (typeof ref === "string") return ref;
  const note = notes.find((n) => n.relativePath === ref.relativePath && belongsToRoot(n, ref.root));
  return note?.path ?? null;
}
