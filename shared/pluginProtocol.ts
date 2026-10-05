// Shared between electron/pluginProtocol.ts (serves these) and
// src/plugins/PluginViewFrame.tsx (points an iframe's src at them) — kept
// here rather than duplicated since shared/ has no Electron/DOM dependency
// and is safe to import from both processes.
export const PLUGIN_SCHEME = "cairn-plugin";
export const PLUGIN_SDK_PATH = "/__cairn_sdk.js";

export function pluginOrigin(pluginId: string): string {
  return `${PLUGIN_SCHEME}://${pluginId}`;
}

// Host -> plugin push message, distinct from the request/response RPC shape
// (PluginViewFrame.tsx's RpcRequest) — fired when the user picks one of the
// plugin's contextMenuItems in the file tree (see FileTree.tsx/loader.tsx).
export interface ContextMenuActionPush {
  channel: "cairn-plugin-rpc";
  kind: "push";
  event: "contextMenuAction";
  itemId: string;
  targetPath: string;
}

// Host -> plugin push telling a mounted view that what it may be showing is
// stale: the active notes folder changed, files on disk changed, or the app
// window regained focus (the watcher doesn't see non-markdown files). Debounced
// by the host (PluginViewFrame.tsx); the plugin re-queries whatever it needs.
export interface ChangePush {
  channel: "cairn-plugin-rpc";
  kind: "push";
  event: "change";
  reason: "folder" | "files" | "focus";
}
