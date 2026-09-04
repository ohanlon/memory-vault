import { describe, expect, it } from "vitest";
import { DEFAULT_APP_SETTINGS, normalizeAppSettings } from "./appSettings";
import { EDITOR_FONT_OPTIONS } from "./editorFonts";

describe("normalizeAppSettings", () => {
  it("passes through valid values unchanged", () => {
    expect(
      normalizeAppSettings({
        tabFolderDisplay: "always",
        dailyNotesFolder: "Journal",
        theme: "light",
        addHeadingToNewNotes: false,
        hidePropertiesByDefault: false,
        showLineNumbers: false,
        editorFontFamily: "monospace",
        editorFontSize: 18,
        enabledCodeLanguages: ["python", "rust"],
      })
    ).toEqual({
      tabFolderDisplay: "always",
      dailyNotesFolder: "Journal",
      theme: "light",
      addHeadingToNewNotes: false,
      hidePropertiesByDefault: false,
      showLineNumbers: false,
      editorFontFamily: "monospace",
      editorFontSize: 18,
      enabledCodeLanguages: ["python", "rust"],
    });
    expect(
      normalizeAppSettings({
        tabFolderDisplay: "never",
        dailyNotesFolder: "Journal",
        theme: "system",
        addHeadingToNewNotes: true,
        hidePropertiesByDefault: true,
        showLineNumbers: true,
        editorFontFamily: "arimo",
        editorFontSize: 12,
        enabledCodeLanguages: [],
      })
    ).toEqual({
      tabFolderDisplay: "never",
      dailyNotesFolder: "Journal",
      theme: "system",
      addHeadingToNewNotes: true,
      hidePropertiesByDefault: true,
      showLineNumbers: true,
      editorFontFamily: "arimo",
      editorFontSize: 12,
      enabledCodeLanguages: [],
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

  it("falls back to the default for a missing, non-string, or blank dailyNotesFolder", () => {
    expect(normalizeAppSettings({ dailyNotesFolder: "" })).toEqual(DEFAULT_APP_SETTINGS);
    expect(normalizeAppSettings({ dailyNotesFolder: "   " })).toEqual(DEFAULT_APP_SETTINGS);
    expect(normalizeAppSettings({ dailyNotesFolder: 42 })).toEqual(DEFAULT_APP_SETTINGS);
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
});
