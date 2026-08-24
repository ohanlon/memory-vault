import fs from "node:fs";
import path from "node:path";
import { DEFAULT_LAYOUT_PREFS, normalizeLayoutPrefs } from "../shared/layoutPrefs";
import type { LayoutPrefs } from "../shared/types";

export function readLayoutPrefsFile(filePath: string): LayoutPrefs {
  if (!fs.existsSync(filePath)) return DEFAULT_LAYOUT_PREFS;
  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    return normalizeLayoutPrefs(JSON.parse(raw));
  } catch {
    return DEFAULT_LAYOUT_PREFS;
  }
}

export function writeLayoutPrefsFile(filePath: string, prefs: LayoutPrefs): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(normalizeLayoutPrefs(prefs), null, 2), "utf-8");
}
