import type { AppSettings, TabFolderDisplay } from "./types";

export const DEFAULT_APP_SETTINGS: AppSettings = {
  tabFolderDisplay: "hover",
  dailyNotesFolder: "Daily Notes",
};

const VALID_TAB_FOLDER_DISPLAY: TabFolderDisplay[] = ["never", "hover", "always"];

/** Fills in missing/invalid fields with defaults. */
export function normalizeAppSettings(value: unknown): AppSettings {
  const raw = (value && typeof value === "object" ? value : {}) as Partial<AppSettings>;
  return {
    tabFolderDisplay: VALID_TAB_FOLDER_DISPLAY.includes(raw.tabFolderDisplay as TabFolderDisplay)
      ? (raw.tabFolderDisplay as TabFolderDisplay)
      : DEFAULT_APP_SETTINGS.tabFolderDisplay,
    dailyNotesFolder:
      typeof raw.dailyNotesFolder === "string" && raw.dailyNotesFolder.trim() !== ""
        ? raw.dailyNotesFolder
        : DEFAULT_APP_SETTINGS.dailyNotesFolder,
  };
}
