import type { AppSettings, CustomTheme, EditorFontFamily, TabFolderDisplay, ThemeSetting } from "./types";
import { EDITOR_FONT_OPTIONS, MAX_EDITOR_FONT_SIZE, MIN_EDITOR_FONT_SIZE } from "./editorFonts";
import { CODE_LANGUAGES, DEFAULT_ENABLED_CODE_LANGUAGES } from "./codeLanguages";
import { isValidDateFormat } from "./dateFormat";
import { THEME_COLOR_VAR_NAMES, defaultColorsFor, isValidCssColor } from "./themeColors";

export const DEFAULT_APP_SETTINGS: AppSettings = {
  tabFolderDisplay: "hover",
  theme: "dark",
  addHeadingToNewNotes: true,
  hidePropertiesByDefault: true,
  showLineNumbers: false,
  editorFontFamily: "system-ui",
  editorFontSize: 14,
  enabledCodeLanguages: DEFAULT_ENABLED_CODE_LANGUAGES,
  hasSeenTour: false,
  dateFormat: "YYYY-MM-DD",
  timeFormat: "HH:mm",
  datetimeFormat: "YYYY-MM-DD HH:mm",
  customThemes: [],
  activeCustomThemeId: null,
};

const VALID_TAB_FOLDER_DISPLAY: TabFolderDisplay[] = ["never", "hover", "always"];
const VALID_THEME: ThemeSetting[] = ["dark", "light", "system", "custom"];
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

/**
 * Validates a single custom theme, filling in any missing/invalid color
 * from its own baseMode's default palette rather than dropping the whole
 * theme over one bad field. Returns null only when the entry isn't
 * salvageable at all (not an object, or an invalid/missing baseMode — there's
 * no sensible palette to fall back to without knowing which one).
 */
export function normalizeCustomTheme(value: unknown): CustomTheme | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Partial<CustomTheme>;
  if (raw.baseMode !== "dark" && raw.baseMode !== "light") return null;
  const defaults = defaultColorsFor(raw.baseMode);
  const rawColors = (raw.colors && typeof raw.colors === "object" ? raw.colors : {}) as Record<string, unknown>;
  const colors: Record<string, string> = {};
  for (const name of THEME_COLOR_VAR_NAMES) {
    const candidate = rawColors[name];
    colors[name] = typeof candidate === "string" && isValidCssColor(candidate) ? candidate : defaults[name];
  }
  return {
    id: typeof raw.id === "string" && raw.id ? raw.id : crypto.randomUUID(),
    name: typeof raw.name === "string" && raw.name.trim() ? raw.name : "Untitled theme",
    baseMode: raw.baseMode,
    colors,
  };
}

export function normalizeCustomThemes(value: unknown): CustomTheme[] {
  if (!Array.isArray(value)) return DEFAULT_APP_SETTINGS.customThemes;
  return value.map(normalizeCustomTheme).filter((t): t is CustomTheme => t !== null);
}

/** Fills in missing/invalid fields with defaults. */
export function normalizeAppSettings(value: unknown): AppSettings {
  const raw = (value && typeof value === "object" ? value : {}) as Partial<AppSettings>;
  return {
    tabFolderDisplay: VALID_TAB_FOLDER_DISPLAY.includes(raw.tabFolderDisplay as TabFolderDisplay)
      ? (raw.tabFolderDisplay as TabFolderDisplay)
      : DEFAULT_APP_SETTINGS.tabFolderDisplay,
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
    hasSeenTour: typeof raw.hasSeenTour === "boolean" ? raw.hasSeenTour : DEFAULT_APP_SETTINGS.hasSeenTour,
    dateFormat:
      typeof raw.dateFormat === "string" && isValidDateFormat(raw.dateFormat)
        ? raw.dateFormat
        : DEFAULT_APP_SETTINGS.dateFormat,
    timeFormat:
      typeof raw.timeFormat === "string" && isValidDateFormat(raw.timeFormat)
        ? raw.timeFormat
        : DEFAULT_APP_SETTINGS.timeFormat,
    datetimeFormat:
      typeof raw.datetimeFormat === "string" && isValidDateFormat(raw.datetimeFormat)
        ? raw.datetimeFormat
        : DEFAULT_APP_SETTINGS.datetimeFormat,
    customThemes: normalizeCustomThemes(raw.customThemes),
    // Existence against customThemes is checked at apply-time (not here) so
    // a theme deleted later degrades gracefully instead of needing this to
    // run in a specific order relative to the customThemes field above.
    activeCustomThemeId: typeof raw.activeCustomThemeId === "string" ? raw.activeCustomThemeId : null,
  };
}
