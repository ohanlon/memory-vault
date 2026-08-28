import fs from "node:fs";
import path from "node:path";
import type { PluginManifest, PluginPermission } from "../shared/types";

const VALID_PERMISSIONS: PluginPermission[] = ["network", "shell:openExternal"];

function isValidManifest(v: unknown): v is PluginManifest {
  if (!v || typeof v !== "object") return false;
  const m = v as Record<string, unknown>;
  return (
    typeof m.id === "string" &&
    typeof m.name === "string" &&
    typeof m.version === "string" &&
    typeof m.main === "string" &&
    Array.isArray(m.permissions) &&
    m.permissions.every((p) => VALID_PERMISSIONS.includes(p as PluginPermission))
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
