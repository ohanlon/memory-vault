import { describe, expect, it } from "vitest";
import { DEFAULT_APP_SETTINGS, normalizeAppSettings } from "./appSettings";

describe("normalizeAppSettings", () => {
  it("passes through valid values unchanged", () => {
    expect(
      normalizeAppSettings({
        tabFolderDisplay: "always",
        dailyNotesFolder: "Journal",
        theme: "light",
        addHeadingToNewNotes: false,
      })
    ).toEqual({
      tabFolderDisplay: "always",
      dailyNotesFolder: "Journal",
      theme: "light",
      addHeadingToNewNotes: false,
    });
    expect(
      normalizeAppSettings({
        tabFolderDisplay: "never",
        dailyNotesFolder: "Journal",
        theme: "system",
        addHeadingToNewNotes: true,
      })
    ).toEqual({
      tabFolderDisplay: "never",
      dailyNotesFolder: "Journal",
      theme: "system",
      addHeadingToNewNotes: true,
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
});
