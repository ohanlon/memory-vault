import { describe, expect, it } from "vitest";
import { DEFAULT_LAYOUT_PREFS, MAX_SIDEBAR_WIDTH, MIN_SIDEBAR_WIDTH, normalizeLayoutPrefs } from "./layoutPrefs";

describe("normalizeLayoutPrefs", () => {
  it("passes through valid values unchanged", () => {
    expect(normalizeLayoutPrefs({ sidebarWidth: 300, rightPanelWidth: 400 })).toEqual({
      sidebarWidth: 300,
      rightPanelWidth: 400,
    });
  });

  it("fills in missing fields with defaults", () => {
    expect(normalizeLayoutPrefs({ sidebarWidth: 300 })).toEqual({
      sidebarWidth: 300,
      rightPanelWidth: DEFAULT_LAYOUT_PREFS.rightPanelWidth,
    });
  });

  it("returns all defaults for null/undefined/non-object input", () => {
    expect(normalizeLayoutPrefs(null)).toEqual(DEFAULT_LAYOUT_PREFS);
    expect(normalizeLayoutPrefs(undefined)).toEqual(DEFAULT_LAYOUT_PREFS);
    expect(normalizeLayoutPrefs("not an object")).toEqual(DEFAULT_LAYOUT_PREFS);
  });

  it("clamps values below the minimum", () => {
    expect(normalizeLayoutPrefs({ sidebarWidth: 10, rightPanelWidth: 10 })).toEqual({
      sidebarWidth: MIN_SIDEBAR_WIDTH,
      rightPanelWidth: MIN_SIDEBAR_WIDTH,
    });
  });

  it("clamps values above the maximum", () => {
    expect(normalizeLayoutPrefs({ sidebarWidth: 9999, rightPanelWidth: 9999 })).toEqual({
      sidebarWidth: MAX_SIDEBAR_WIDTH,
      rightPanelWidth: MAX_SIDEBAR_WIDTH,
    });
  });

  it("falls back to defaults for non-numeric values", () => {
    expect(normalizeLayoutPrefs({ sidebarWidth: "wide", rightPanelWidth: null })).toEqual(DEFAULT_LAYOUT_PREFS);
  });
});
