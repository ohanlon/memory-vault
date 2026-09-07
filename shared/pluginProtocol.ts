// Shared between electron/pluginProtocol.ts (serves these) and
// src/plugins/PluginViewFrame.tsx (points an iframe's src at them) — kept
// here rather than duplicated since shared/ has no Electron/DOM dependency
// and is safe to import from both processes.
export const PLUGIN_SCHEME = "cairn-plugin";
export const PLUGIN_SDK_PATH = "/__cairn_sdk.js";

export function pluginOrigin(pluginId: string): string {
  return `${PLUGIN_SCHEME}://${pluginId}`;
}
