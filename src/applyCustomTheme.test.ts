// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { DEFAULT_DARK_COLORS, THEME_COLOR_VAR_NAMES } from "@shared/themeColors";
import type { CustomTheme } from "@shared/types";
import { applyCustomThemeProperties, clearCustomThemeProperties } from "./applyCustomTheme";

const THEME: CustomTheme = {
  id: "t1",
  name: "Test Theme",
  baseMode: "dark",
  colors: DEFAULT_DARK_COLORS,
};

describe("applyCustomThemeProperties", () => {
  it("sets every theme color as an inline CSS custom property", () => {
    const el = document.createElement("div");
    applyCustomThemeProperties(el, THEME);
    for (const name of THEME_COLOR_VAR_NAMES) {
      expect(el.style.getPropertyValue(`--${name}`)).toBe(THEME.colors[name]);
    }
  });
});

describe("clearCustomThemeProperties", () => {
  it("removes every previously-applied custom property", () => {
    const el = document.createElement("div");
    applyCustomThemeProperties(el, THEME);
    clearCustomThemeProperties(el);
    for (const name of THEME_COLOR_VAR_NAMES) {
      expect(el.style.getPropertyValue(`--${name}`)).toBe("");
    }
    expect(el.style.length).toBe(0);
  });

  it("is a no-op on an element that never had custom properties set", () => {
    const el = document.createElement("div");
    clearCustomThemeProperties(el);
    expect(el.style.length).toBe(0);
  });
});
