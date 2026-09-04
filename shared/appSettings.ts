import type { AppSettings, EditorFontFamily, TabFolderDisplay, ThemeSetting } from "./types";
import { EDITOR_FONT_OPTIONS, MAX_EDITOR_FONT_SIZE, MIN_EDITOR_FONT_SIZE } from "./editorFonts";
import { CODE_LANGUAGES, DEFAULT_ENABLED_CODE_LANGUAGES } from "./codeLanguages";

export const DEFAULT_APP_SETTINGS: AppSettings = {
  tabFolderDisplay: "hover",
  dailyNotesFolder: "Daily Notes",
  theme: "dark",
  addHeadingToNewNotes: true,
  hidePropertiesByDefault: true,
  showLineNumbers: true,
  editorFontFamily: "system-ui",
  editorFontSize: 14,
  enabledCodeLanguages: DEFAULT_ENABLED_CODE_LANGUAGES,
};

const VALID_TAB_FOLDER_DISPLAY: TabFolderDisplay[] = ["never", "hover", "always"];
const VALID_THEME: ThemeSetting[] = ["dark", "light", "system"];
const VALID_EDITOR_FONT_FAMILY: EditorFontFamily[] = EDITOR_FONT_OPTIONS.map((opt) => opt.value);
const VALID_CODE_LANGUAGE_IDS = new Set(CODE_LANGUAGES.map((l) => l.id));

/**
 * Keeps only recognized, deduplicated language ids. Falls back to the
 * default set only when the value is missing/malformed entirely — a valid
 * but empty array (the user deselected every language) is left as-is.
 */
function normalizeEnabledCodeLanguages(value: unknown): string[] {
  if (!Array.isArray(value)) return DEFAULT_APP_SETTINGS.enabledCodeLanguages;
  return Array.from(new Set(value.filter((v): v is string => typeof v === "string" && VALID_CODE_LANGUAGE_IDS.has(v))));
}

function clampFontSize(value: unknown, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.min(MAX_EDITOR_FONT_SIZE, Math.max(MIN_EDITOR_FONT_SIZE, Math.round(value)));
}

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
    theme: VALID_THEME.includes(raw.theme as ThemeSetting) ? (raw.theme as ThemeSetting) : DEFAULT_APP_SETTINGS.theme,
    addHeadingToNewNotes:
      typeof raw.addHeadingToNewNotes === "boolean"
        ? raw.addHeadingToNewNotes
        : DEFAULT_APP_SETTINGS.addHeadingToNewNotes,
    hidePropertiesByDefault:
      typeof raw.hidePropertiesByDefault === "boolean"
        ? raw.hidePropertiesByDefault
        : DEFAULT_APP_SETTINGS.hidePropertiesByDefault,
    showLineNumbers:
      typeof raw.showLineNumbers === "boolean" ? raw.showLineNumbers : DEFAULT_APP_SETTINGS.showLineNumbers,
    editorFontFamily: VALID_EDITOR_FONT_FAMILY.includes(raw.editorFontFamily as EditorFontFamily)
      ? (raw.editorFontFamily as EditorFontFamily)
      : DEFAULT_APP_SETTINGS.editorFontFamily,
    editorFontSize: clampFontSize(raw.editorFontSize, DEFAULT_APP_SETTINGS.editorFontSize),
    enabledCodeLanguages: normalizeEnabledCodeLanguages(raw.enabledCodeLanguages),
  };
}
