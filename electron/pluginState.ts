import fs from "node:fs";
import path from "node:path";
import type { PluginStateFile } from "../shared/types";

// Which installed plugins are switched on. Separate from plugin-permissions
// .json: disabling a plugin must not revoke what the user already granted it.
// A plugin with no entry counts as enabled, so dropping a folder into the
// plugins directory keeps working as before; only bundled seeding records an
// explicit `enabled: false`.
export function readPluginStateFile(filePath: string): PluginStateFile {
  if (!fs.existsSync(filePath)) return {};
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const out: PluginStateFile = {};
    for (const [id, v] of Object.entries(parsed as Record<string, { enabled?: unknown }>)) {
      if (v && typeof v.enabled === "boolean") out[id] = { enabled: v.enabled };
    }
    return out;
  } catch {
    return {};
  }
}

export function writePluginStateFile(filePath: string, state: PluginStateFile): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(state, null, 2), "utf-8");
}

export function isPluginEnabled(state: PluginStateFile, pluginId: string): boolean {
  return state[pluginId]?.enabled ?? true;
}

export function setPluginEnabled(state: PluginStateFile, pluginId: string, enabled: boolean): PluginStateFile {
  return { ...state, [pluginId]: { enabled } };
}
