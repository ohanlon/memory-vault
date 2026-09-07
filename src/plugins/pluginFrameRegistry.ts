import type { ContextMenuActionPush } from "@shared/pluginProtocol";

// Tracks which plugins currently have a live, mounted iframe (registered by
// PluginViewFrame on load/unmount) so a host->plugin push message (e.g. a
// file-tree context-menu action) has somewhere to go. A plugin with no
// mounted view — nothing in the sidebar or an open tab — has no live frame,
// so pushToPlugin fails and callers (see FileTree.tsx) should check
// hasLivePluginFrame before even offering the action, rather than showing a
// menu item that silently does nothing.
const frames = new Map<string, Window>();

export function registerPluginFrame(pluginId: string, win: Window): void {
  frames.set(pluginId, win);
}

export function unregisterPluginFrame(pluginId: string, win: Window): void {
  if (frames.get(pluginId) === win) frames.delete(pluginId);
}

export function hasLivePluginFrame(pluginId: string): boolean {
  return frames.has(pluginId);
}

export function pushToPlugin(pluginId: string, message: ContextMenuActionPush): boolean {
  const win = frames.get(pluginId);
  if (!win) return false;
  win.postMessage(message, "*");
  return true;
}
