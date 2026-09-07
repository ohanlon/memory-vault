import { useSyncExternalStore } from "react";
import type { PluginManifest } from "@shared/types";
import { pluginRegistry } from "./registry";
import { makePluginViewComponent } from "./PluginViewFrame";
import { clearPluginStatus, getPluginStatus, subscribePluginStatus } from "./pluginStatusStore";

let registeredPluginIds: string[] = [];

function makeStatusItemComponent(manifest: PluginManifest) {
  return function PluginStatusItem() {
    const text = useSyncExternalStore(
      subscribePluginStatus,
      () => getPluginStatus(manifest.id) ?? `🔌 ${manifest.name}`
    );
    return <span title={`${manifest.name} v${manifest.version}`}>{text}</span>;
  };
}

// Discovers third-party plugins declared under the current stack's
// .cairn/plugins folder (electron/pluginRegistry.ts) and registers a
// status-bar badge plus any declared sidebar views for each one, through
// the same PluginRegistry API the built-in app uses (see plugins/core.tsx).
// A plugin's view renders as a sandboxed <iframe> (PluginViewFrame) pointed
// at its own cairn-plugin://<id>/ origin (electron/pluginProtocol.ts) —
// same-process and far cheaper than the old BrowserWindow-per-plugin model,
// while still giving the view real embedded UI instead of just a badge.
export async function loadThirdPartyPlugins(): Promise<void> {
  for (const id of registeredPluginIds) {
    pluginRegistry.unregisterPlugin(id);
    clearPluginStatus(id);
  }
  registeredPluginIds = [];

  const manifests = await window.memoryStack.listPlugins();
  for (const manifest of manifests) {
    pluginRegistry.registerStatusItem(
      { id: `plugin:${manifest.id}`, component: makeStatusItemComponent(manifest) },
      manifest.id
    );
    for (const view of manifest.views ?? []) {
      pluginRegistry.registerView(
        {
          id: `plugin:${manifest.id}:${view.id}`,
          region: view.region,
          title: view.title,
          component: makePluginViewComponent(manifest.id, manifest.name, view.entry),
        },
        manifest.id
      );
    }
    for (const item of manifest.ribbonItems ?? []) {
      pluginRegistry.registerRibbonItem(
        {
          id: `plugin:${manifest.id}:${item.id}`,
          title: item.title,
          icon: item.icon,
          viewId: `plugin:${manifest.id}:${item.opensView}`,
        },
        manifest.id
      );
    }
    registeredPluginIds.push(manifest.id);
  }
}
