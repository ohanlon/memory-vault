// A tiny external store for plugin-set status-bar text, subscribed to via
// useSyncExternalStore from the status item component (see loader.tsx).
// Separate from PluginRegistry itself because PluginRegistry has no
// reactivity — its contributions are only re-read when something else
// causes a re-render, which isn't good enough for "live" status text.
type Listener = () => void;

const status = new Map<string, string>();
const listeners = new Set<Listener>();

export function setPluginStatus(pluginId: string, text: string): void {
  status.set(pluginId, text);
  listeners.forEach((l) => l());
}

export function getPluginStatus(pluginId: string): string | undefined {
  return status.get(pluginId);
}

export function subscribePluginStatus(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function clearPluginStatus(pluginId: string): void {
  status.delete(pluginId);
}
