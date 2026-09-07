import fs from "node:fs";
import path from "node:path";
import type {
  PluginContextMenuItem,
  PluginManifest,
  PluginPermission,
  PluginRibbonItem,
  PluginTab,
  PluginView,
} from "../shared/types";

const VALID_PERMISSIONS: PluginPermission[] = ["network", "shell:openExternal"];
const VALID_VIEW_REGIONS = ["left-sidebar", "right-sidebar"];
const VALID_CONTEXT_MENU_TARGETS = ["note", "folder"];

function isValidView(v: unknown): v is PluginView {
  if (!v || typeof v !== "object") return false;
  const view = v as Record<string, unknown>;
  return (
    typeof view.id === "string" &&
    typeof view.title === "string" &&
    typeof view.entry === "string" &&
    VALID_VIEW_REGIONS.includes(view.region as string)
  );
}

function isValidTab(v: unknown): v is PluginTab {
  if (!v || typeof v !== "object") return false;
  const tab = v as Record<string, unknown>;
  return typeof tab.id === "string" && typeof tab.title === "string" && typeof tab.entry === "string";
}

// `opensView`/`opensTab` must reference one of this same manifest's own
// declared views/tabs, and exactly one of the two must be set — a dangling
// reference or an ambiguous/empty item drops the whole manifest, same
// strictness as every other malformed-manifest case here.
function isValidRibbonItem(v: unknown, viewIds: Set<string>, tabIds: Set<string>): v is PluginRibbonItem {
  if (!v || typeof v !== "object") return false;
  const item = v as Record<string, unknown>;
  if (typeof item.id !== "string" || typeof item.title !== "string" || typeof item.icon !== "string") {
    return false;
  }
  const opensView = typeof item.opensView === "string" ? item.opensView : undefined;
  const opensTab = typeof item.opensTab === "string" ? item.opensTab : undefined;
  if ((opensView === undefined) === (opensTab === undefined)) return false; // exactly one required
  return opensView !== undefined ? viewIds.has(opensView) : tabIds.has(opensTab as string);
}

function isValidContextMenuItem(v: unknown): v is PluginContextMenuItem {
  if (!v || typeof v !== "object") return false;
  const item = v as Record<string, unknown>;
  return (
    typeof item.id === "string" &&
    typeof item.label === "string" &&
    VALID_CONTEXT_MENU_TARGETS.includes(item.target as string)
  );
}

function isValidManifest(v: unknown): v is PluginManifest {
  if (!v || typeof v !== "object") return false;
  const m = v as Record<string, unknown>;
  const viewIds = new Set(
    Array.isArray(m.views) ? (m.views as PluginView[]).map((view) => view?.id).filter(Boolean) : []
  );
  const tabIds = new Set(
    Array.isArray(m.tabs) ? (m.tabs as PluginTab[]).map((tab) => tab?.id).filter(Boolean) : []
  );
  return (
    typeof m.id === "string" &&
    typeof m.name === "string" &&
    typeof m.version === "string" &&
    typeof m.main === "string" &&
    Array.isArray(m.permissions) &&
    m.permissions.every((p) => VALID_PERMISSIONS.includes(p as PluginPermission)) &&
    (m.views === undefined || (Array.isArray(m.views) && m.views.every(isValidView))) &&
    (m.tabs === undefined || (Array.isArray(m.tabs) && m.tabs.every(isValidTab))) &&
    (m.ribbonItems === undefined ||
      (Array.isArray(m.ribbonItems) && m.ribbonItems.every((r) => isValidRibbonItem(r, viewIds, tabIds)))) &&
    (m.contextMenuItems === undefined ||
      (Array.isArray(m.contextMenuItems) && m.contextMenuItems.every(isValidContextMenuItem)))
  );
}

export interface DiscoveredPlugin {
  manifest: PluginManifest;
  /** Absolute path to the plugin's own folder (containing manifest.json and its main entry). */
  dir: string;
}

// Plugins live under <stackRoot>/.cairn/plugins/<folder>/manifest.json — one
// plugin set per stack, no global install directory.
export function discoverPlugins(stackRoot: string): DiscoveredPlugin[] {
  const pluginsDir = path.join(stackRoot, ".cairn", "plugins");
  if (!fs.existsSync(pluginsDir)) return [];

  const plugins: DiscoveredPlugin[] = [];
  for (const entry of fs.readdirSync(pluginsDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const dir = path.join(pluginsDir, entry.name);
    const manifestPath = path.join(dir, "manifest.json");
    if (!fs.existsSync(manifestPath)) continue;
    try {
      const parsed = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
      if (isValidManifest(parsed)) plugins.push({ manifest: parsed, dir });
    } catch {
      // skip malformed manifest
    }
  }
  return plugins;
}
