import { describe, expect, it } from "vitest";
import { DEFAULT_APP_SETTINGS, normalizeAppSettings } from "./appSettings";

describe("normalizeAppSettings", () => {
  it("passes through a valid value unchanged", () => {
    expect(normalizeAppSettings({ tabFolderDisplay: "always" })).toEqual({ tabFolderDisplay: "always" });
    expect(normalizeAppSettings({ tabFolderDisplay: "never" })).toEqual({ tabFolderDisplay: "never" });
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
});
