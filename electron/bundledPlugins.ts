import fs from "node:fs";
import path from "node:path";
import { setPluginEnabled } from "./pluginState";
import type { PluginStateFile } from "../shared/types";

function readIdAndVersion(dir: string): { id: string; version: string } | null {
  try {
    const m = JSON.parse(fs.readFileSync(path.join(dir, "manifest.json"), "utf-8"));
    return typeof m.id === "string" && typeof m.version === "string" ? { id: m.id, version: m.version } : null;
  } catch {
    return null;
  }
}

// Numeric-aware dotted comparison; anything non-numeric counts as 0.
export function isNewerVersion(candidate: string, installed: string): boolean {
  const a = candidate.split(".").map((n) => parseInt(n, 10) || 0);
  const b = installed.split(".").map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const d = (a[i] ?? 0) - (b[i] ?? 0);
    if (d !== 0) return d > 0;
  }
  return false;
}

// Installs plugins shipped inside the app into the global plugins directory.
// A fresh install is recorded as disabled (opt-in); a newer bundled version
// overwrites the files but keeps whatever enabled state the user chose. This
// copy-into-place step is also what a future store install will do.
export function seedBundledPlugins(bundledDir: string, pluginsDir: string, state: PluginStateFile): PluginStateFile {
  if (!fs.existsSync(bundledDir)) return state;
  let next = state;
  for (const entry of fs.readdirSync(bundledDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const src = path.join(bundledDir, entry.name);
    const bundled = readIdAndVersion(src);
    if (!bundled) continue;
    const dest = path.join(pluginsDir, bundled.id);
    const installed = fs.existsSync(dest) ? readIdAndVersion(dest) : null;
    if (installed && !isNewerVersion(bundled.version, installed.version)) continue;
    fs.rmSync(dest, { recursive: true, force: true });
    fs.mkdirSync(pluginsDir, { recursive: true });
    fs.cpSync(src, dest, { recursive: true });
    if (!installed && next[bundled.id] === undefined) next = setPluginEnabled(next, bundled.id, false);
  }
  return next;
}
