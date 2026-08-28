import type { PluginManifest } from "@shared/types";
import { pluginRegistry } from "./registry";

let registeredPluginIds: string[] = [];

function makeStatusItemComponent(manifest: PluginManifest) {
  return function PluginStatusItem() {
    return <span title={`${manifest.name} v${manifest.version}`}>🔌 {manifest.name}</span>;
  };
}

// Discovers third-party plugins declared under the current stack's
// .cairn/plugins folder (electron/pluginRegistry.ts) and registers a
// status-bar badge for each one through the same PluginRegistry API the
// built-in app uses (see plugins/core.tsx).
//
// Full UI contributions (registerView/registerRegion/registerTabKind)
// aren't wired up here: those hand the host a live React component, but a
// plugin's code runs in its own isolated BrowserWindow (electron/
// pluginHost.ts) precisely so it can't reach window.memoryStack or the
// host's JS realm — and a live component reference can't cross that
// boundary either. Rendering a plugin's actual UI inside the host layout
// would need a <webview>-based compositing layer as a follow-up; the
// process isolation and network/shell permission gate (electron/
// domainPolicy.ts) are already fully active regardless of that gap.
export async function loadThirdPartyPlugins(): Promise<void> {
  for (const id of registeredPluginIds) pluginRegistry.unregisterPlugin(id);
  registeredPluginIds = [];

  const manifests = await window.memoryStack.listPlugins();
  for (const manifest of manifests) {
    pluginRegistry.registerStatusItem(
      { id: `plugin:${manifest.id}`, component: makeStatusItemComponent(manifest) },
      manifest.id
    );
    registeredPluginIds.push(manifest.id);
  }
}
