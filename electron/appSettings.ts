import fs from "node:fs";
import path from "node:path";
import { DEFAULT_APP_SETTINGS, normalizeAppSettings } from "../shared/appSettings";
import type { AppSettings } from "../shared/types";

export function readAppSettingsFile(filePath: string): AppSettings {
  if (!fs.existsSync(filePath)) return DEFAULT_APP_SETTINGS;
  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    return normalizeAppSettings(JSON.parse(raw));
  } catch {
    return DEFAULT_APP_SETTINGS;
  }
}

export function writeAppSettingsFile(filePath: string, settings: AppSettings): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(normalizeAppSettings(settings), null, 2), "utf-8");
}
