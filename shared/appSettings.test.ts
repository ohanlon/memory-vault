import { describe, expect, it } from "vitest";
import { DEFAULT_APP_SETTINGS, normalizeAppSettings, normalizeCustomTheme, normalizeCustomThemes } from "./appSettings";
import { EDITOR_FONT_OPTIONS } from "./editorFonts";
import { DEFAULT_DARK_COLORS, DEFAULT_LIGHT_COLORS } from "./themeColors";

describe("normalizeAppSettings", () => {
  it("passes through valid values unchanged", () => {
    expect(
      normalizeAppSettings({
        tabFolderDisplay: "always",
        theme: "light",
        addHeadingToNewNotes: false,
        hidePropertiesByDefault: false,
        showLineNumbers: false,
        editorFontFamily: "monospace",
        editorFontSize: 18,
        enabledCodeLanguages: ["python", "rust"],
        hasSeenTour: true,
        dateFormat: "DD/MM/YYYY",
        timeFormat: "HH:mm",
        datetimeFormat: "DD/MM/YYYY HH:mm",
        customThemes: [],
        activeCustomThemeId: null,
      })
    ).toEqual({
      tabFolderDisplay: "always",
      theme: "light",
      addHeadingToNewNotes: false,
      hidePropertiesByDefault: false,
      showLineNumbers: false,
      editorFontFamily: "monospace",
      editorFontSize: 18,
      enabledCodeLanguages: ["python", "rust"],
      hasSeenTour: true,
      dateFormat: "DD/MM/YYYY",
      timeFormat: "HH:mm",
      datetimeFormat: "DD/MM/YYYY HH:mm",
      customThemes: [],
      activeCustomThemeId: null,
    });
    expect(
      normalizeAppSettings({
        tabFolderDisplay: "never",
        theme: "system",
        addHeadingToNewNotes: true,
        hidePropertiesByDefault: true,
        showLineNumbers: true,
        editorFontFamily: "arimo",
        editorFontSize: 12,
        enabledCodeLanguages: [],
        hasSeenTour: false,
        dateFormat: "YYYY-MM-DD",
        timeFormat: "HH:mm",
        datetimeFormat: "YYYY-MM-DD HH:mm",
        customThemes: [{ id: "t1", name: "My Theme", baseMode: "dark", colors: { "bg-base": "#123456" } }],
        activeCustomThemeId: "t1",
      })
    ).toEqual({
      tabFolderDisplay: "never",
      theme: "system",
      addHeadingToNewNotes: true,
      hidePropertiesByDefault: true,
      showLineNumbers: true,
      editorFontFamily: "arimo",
      editorFontSize: 12,
      enabledCodeLanguages: [],
      hasSeenTour: false,
      dateFormat: "YYYY-MM-DD",
      timeFormat: "HH:mm",
      datetimeFormat: "YYYY-MM-DD HH:mm",
      customThemes: [
        { id: "t1", name: "My Theme", baseMode: "dark", colors: { ...DEFAULT_DARK_COLORS, "bg-base": "#123456" } },
      ],
      activeCustomThemeId: "t1",
    });
  });

  it("returns defaults for null/undefined/non-object input", () => {
    expect(normalizeAppSettings(null)).toEqual(DEFAULT_APP_SETTINGS);
    expect(normalizeAppSettings(undefined)).toEqual(DEFAULT_APP_SETTINGS);
    expect(normalizeAppSettings("not an object")).toEqual(DEFAULT_APP_SETTINGS);
  });

  it("falls back to the default for an invalid tabFolderDisplay value", () => {
    expect(normalizeAppSettings({ tabFolderDisplay: "sometimes" })).toEqual(DEFAULT_APP_SETTINGS);
    expect(normalizeAppSettings({})).toEqual(DEFAULT_APP_SETTINGS);
  });

  it("falls back to the default for an invalid theme value", () => {
    expect(normalizeAppSettings({ theme: "solarized" })).toEqual(DEFAULT_APP_SETTINGS);
    expect(normalizeAppSettings({ theme: 1 })).toEqual(DEFAULT_APP_SETTINGS);
  });

  it("accepts every valid theme value", () => {
    expect(normalizeAppSettings({ theme: "dark" }).theme).toBe("dark");
    expect(normalizeAppSettings({ theme: "light" }).theme).toBe("light");
    expect(normalizeAppSettings({ theme: "system" }).theme).toBe("system");
  });

  it("falls back to the default for a non-boolean addHeadingToNewNotes", () => {
    expect(normalizeAppSettings({ addHeadingToNewNotes: "no" })).toEqual(DEFAULT_APP_SETTINGS);
    expect(normalizeAppSettings({ addHeadingToNewNotes: undefined })).toEqual(DEFAULT_APP_SETTINGS);
  });

  it("accepts both boolean addHeadingToNewNotes values", () => {
    expect(normalizeAppSettings({ addHeadingToNewNotes: true }).addHeadingToNewNotes).toBe(true);
    expect(normalizeAppSettings({ addHeadingToNewNotes: false }).addHeadingToNewNotes).toBe(false);
  });

  it("falls back to the default for a non-boolean hidePropertiesByDefault", () => {
    expect(normalizeAppSettings({ hidePropertiesByDefault: "no" })).toEqual(DEFAULT_APP_SETTINGS);
    expect(normalizeAppSettings({ hidePropertiesByDefault: undefined })).toEqual(DEFAULT_APP_SETTINGS);
  });

  it("accepts both boolean hidePropertiesByDefault values", () => {
    expect(normalizeAppSettings({ hidePropertiesByDefault: true }).hidePropertiesByDefault).toBe(true);
    expect(normalizeAppSettings({ hidePropertiesByDefault: false }).hidePropertiesByDefault).toBe(false);
  });

  it("falls back to the default for a non-boolean showLineNumbers", () => {
    expect(normalizeAppSettings({ showLineNumbers: "no" })).toEqual(DEFAULT_APP_SETTINGS);
    expect(normalizeAppSettings({ showLineNumbers: undefined })).toEqual(DEFAULT_APP_SETTINGS);
  });

  it("accepts both boolean showLineNumbers values", () => {
    expect(normalizeAppSettings({ showLineNumbers: true }).showLineNumbers).toBe(true);
    expect(normalizeAppSettings({ showLineNumbers: false }).showLineNumbers).toBe(false);
  });

  it("falls back to the default for an invalid editorFontFamily value", () => {
    expect(normalizeAppSettings({ editorFontFamily: "comic-sans" })).toEqual(DEFAULT_APP_SETTINGS);
    expect(normalizeAppSettings({ editorFontFamily: 1 })).toEqual(DEFAULT_APP_SETTINGS);
  });

  it("accepts every valid editorFontFamily value", () => {
    for (const { value } of EDITOR_FONT_OPTIONS) {
      expect(normalizeAppSettings({ editorFontFamily: value }).editorFontFamily).toBe(value);
    }
  });

  it("falls back to the default for a non-numeric editorFontSize", () => {
    expect(normalizeAppSettings({ editorFontSize: "large" }).editorFontSize).toBe(
      DEFAULT_APP_SETTINGS.editorFontSize
    );
    expect(normalizeAppSettings({ editorFontSize: NaN }).editorFontSize).toBe(DEFAULT_APP_SETTINGS.editorFontSize);
  });

  it("clamps editorFontSize to the allowed range", () => {
    expect(normalizeAppSettings({ editorFontSize: 2 }).editorFontSize).toBe(10);
    expect(normalizeAppSettings({ editorFontSize: 999 }).editorFontSize).toBe(28);
  });

  it("rounds a fractional editorFontSize", () => {
    expect(normalizeAppSettings({ editorFontSize: 15.6 }).editorFontSize).toBe(16);
  });

  it("falls back to the default enabledCodeLanguages when the value isn't an array", () => {
    expect(normalizeAppSettings({ enabledCodeLanguages: "python" })).toEqual(DEFAULT_APP_SETTINGS);
    expect(normalizeAppSettings({ enabledCodeLanguages: undefined })).toEqual(DEFAULT_APP_SETTINGS);
    expect(normalizeAppSettings({})).toEqual(DEFAULT_APP_SETTINGS);
  });

  it("drops unrecognized language ids and non-string entries", () => {
    expect(normalizeAppSettings({ enabledCodeLanguages: ["python", "not-a-language", 5, null] }).enabledCodeLanguages).toEqual(["python"]);
  });

  it("deduplicates repeated language ids", () => {
    expect(normalizeAppSettings({ enabledCodeLanguages: ["python", "python", "rust"] }).enabledCodeLanguages).toEqual([
      "python",
      "rust",
    ]);
  });

  it("preserves a deliberately empty selection instead of falling back to defaults", () => {
    expect(normalizeAppSettings({ enabledCodeLanguages: [] }).enabledCodeLanguages).toEqual([]);
  });

  it("falls back to the default for a non-boolean hasSeenTour", () => {
    expect(normalizeAppSettings({ hasSeenTour: "yes" })).toEqual(DEFAULT_APP_SETTINGS);
    expect(normalizeAppSettings({ hasSeenTour: undefined })).toEqual(DEFAULT_APP_SETTINGS);
  });

  it("accepts both boolean hasSeenTour values", () => {
    expect(normalizeAppSettings({ hasSeenTour: true }).hasSeenTour).toBe(true);
    expect(normalizeAppSettings({ hasSeenTour: false }).hasSeenTour).toBe(false);
  });

  it("accepts a valid dateFormat/timeFormat/datetimeFormat", () => {
    expect(normalizeAppSettings({ dateFormat: "DD/MM/YYYY" }).dateFormat).toBe("DD/MM/YYYY");
    expect(normalizeAppSettings({ timeFormat: "h:mm a" }).timeFormat).toBe("h:mm a");
    expect(normalizeAppSettings({ datetimeFormat: "DD/MM/YYYY HH:mm" }).datetimeFormat).toBe("DD/MM/YYYY HH:mm");
  });

  it("falls back to the default for an invalid or non-string dateFormat/timeFormat/datetimeFormat", () => {
    expect(normalizeAppSettings({ dateFormat: "" }).dateFormat).toBe(DEFAULT_APP_SETTINGS.dateFormat);
    expect(normalizeAppSettings({ dateFormat: 5 }).dateFormat).toBe(DEFAULT_APP_SETTINGS.dateFormat);
    expect(normalizeAppSettings({ dateFormat: 'YYYY-MM-DD"' }).dateFormat).toBe(DEFAULT_APP_SETTINGS.dateFormat);
    expect(normalizeAppSettings({ timeFormat: "" }).timeFormat).toBe(DEFAULT_APP_SETTINGS.timeFormat);
    expect(normalizeAppSettings({ datetimeFormat: "" }).datetimeFormat).toBe(DEFAULT_APP_SETTINGS.datetimeFormat);
  });

  it("accepts theme='custom' and a string activeCustomThemeId", () => {
    const result = normalizeAppSettings({ theme: "custom", activeCustomThemeId: "abc" });
    expect(result.theme).toBe("custom");
    expect(result.activeCustomThemeId).toBe("abc");
  });

  it("falls back to null for a non-string activeCustomThemeId", () => {
    expect(normalizeAppSettings({ activeCustomThemeId: 5 }).activeCustomThemeId).toBeNull();
    expect(normalizeAppSettings({}).activeCustomThemeId).toBeNull();
  });

  it("does not require activeCustomThemeId to exist in customThemes — existence is checked at apply-time, not here", () => {
    const result = normalizeAppSettings({ activeCustomThemeId: "deleted-theme", customThemes: [] });
    expect(result.activeCustomThemeId).toBe("deleted-theme");
    expect(result.customThemes).toEqual([]);
  });
});

describe("normalizeCustomTheme", () => {
  it("passes through a fully valid theme unchanged", () => {
    const theme = { id: "t1", name: "My Theme", baseMode: "dark" as const, colors: DEFAULT_DARK_COLORS };
    expect(normalizeCustomTheme(theme)).toEqual(theme);
  });

  it("returns null for a non-object", () => {
    expect(normalizeCustomTheme(null)).toBeNull();
    expect(normalizeCustomTheme("not an object")).toBeNull();
    expect(normalizeCustomTheme(5)).toBeNull();
  });

  it("returns null for a missing or invalid baseMode", () => {
    expect(normalizeCustomTheme({ id: "t1", name: "x", colors: {} })).toBeNull();
    expect(normalizeCustomTheme({ id: "t1", name: "x", baseMode: "purple", colors: {} })).toBeNull();
  });

  it("generates an id when missing", () => {
    const result = normalizeCustomTheme({ name: "x", baseMode: "dark", colors: {} });
    expect(result?.id).toEqual(expect.any(String));
    expect(result?.id.length).toBeGreaterThan(0);
  });

  it("falls back to 'Untitled theme' for a missing or blank name", () => {
    expect(normalizeCustomTheme({ id: "t1", baseMode: "dark", colors: {} })?.name).toBe("Untitled theme");
    expect(normalizeCustomTheme({ id: "t1", name: "   ", baseMode: "dark", colors: {} })?.name).toBe(
      "Untitled theme"
    );
  });

  it("fills a missing or invalid color from the theme's own baseMode default, leaving valid ones as-is", () => {
    const result = normalizeCustomTheme({
      id: "t1",
      name: "x",
      baseMode: "light",
      colors: { "bg-base": "#123456", "text-primary": "not a color" },
    });
    expect(result?.colors["bg-base"]).toBe("#123456");
    expect(result?.colors["text-primary"]).toBe(DEFAULT_LIGHT_COLORS["text-primary"]);
    expect(result?.colors["accent-blue"]).toBe(DEFAULT_LIGHT_COLORS["accent-blue"]);
  });

  it("handles a missing or non-object colors field entirely", () => {
    const result = normalizeCustomTheme({ id: "t1", name: "x", baseMode: "dark" });
    expect(result?.colors).toEqual(DEFAULT_DARK_COLORS);
  });
});

describe("normalizeCustomThemes", () => {
  it("falls back to the default (empty array) when the value isn't an array", () => {
    expect(normalizeCustomThemes("not an array")).toEqual([]);
    expect(normalizeCustomThemes(undefined)).toEqual([]);
  });

  it("drops unsalvageable entries but keeps the rest", () => {
    const result = normalizeCustomThemes([
      { id: "t1", name: "Good", baseMode: "dark", colors: {} },
      { id: "t2", name: "Bad", baseMode: "invalid", colors: {} },
      null,
      "not an object",
    ]);
    expect(result.map((t) => t.id)).toEqual(["t1"]);
  });
});
