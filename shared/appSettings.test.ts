import { describe, expect, it } from "vitest";
import { DEFAULT_APP_SETTINGS, normalizeAppSettings } from "./appSettings";

describe("normalizeAppSettings", () => {
  it("passes through valid values unchanged", () => {
    expect(normalizeAppSettings({ tabFolderDisplay: "always", dailyNotesFolder: "Journal" })).toEqual({
      tabFolderDisplay: "always",
      dailyNotesFolder: "Journal",
    });
    expect(normalizeAppSettings({ tabFolderDisplay: "never", dailyNotesFolder: "Journal" })).toEqual({
      tabFolderDisplay: "never",
      dailyNotesFolder: "Journal",
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
});
