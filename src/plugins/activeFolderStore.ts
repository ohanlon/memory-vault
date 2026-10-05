// Which notes folder is open, as a tiny external store so plugin frames
// (PluginViewFrame) can tell their iframe when it changes without App having
// to know which plugins are mounted. Same shape as focusedViewStore.
type Listener = () => void;

let current: string | null = null;
const listeners = new Set<Listener>();

export function setActiveFolderName(name: string | null): void {
  if (name === current) return;
  current = name;
  listeners.forEach((l) => l());
}

export function getActiveFolderName(): string | null {
  return current;
}

export function subscribeActiveFolder(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
