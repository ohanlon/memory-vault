type Flush = () => Promise<void>;

// EditorPane debounces disk writes (see SAVE_DEBOUNCE_MS) by scheduling a
// setTimeout closed over the note's *current* path. If that note gets
// renamed/moved while the timer is still pending, the timer fires afterward
// and writes the stale content back to the old path — resurrecting the file
// the rename just got rid of. Callers that change a note's path out from
// under the editor (rename, move) must flush first so no stale timer is
// left to fire.
const pending = new Map<string, Flush>();

export function registerPendingSave(path: string, flush: Flush): void {
  pending.set(path, flush);
}

export function unregisterPendingSave(path: string, flush: Flush): void {
  if (pending.get(path) === flush) pending.delete(path);
}

export async function flushPendingSave(path: string): Promise<void> {
  const flush = pending.get(path);
  if (!flush) return;
  pending.delete(path);
  await flush();
}
