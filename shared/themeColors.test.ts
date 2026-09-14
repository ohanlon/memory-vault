import { describe, expect, it } from "vitest";
import {
  DEFAULT_DARK_COLORS,
  DEFAULT_LIGHT_COLORS,
  THEME_COLOR_VAR_NAMES,
  THEME_COLOR_VARS,
  defaultColorsFor,
  isValidCssColor,
} from "./themeColors";

describe("THEME_COLOR_VARS", () => {
  it("has a unique name per entry", () => {
    const names = THEME_COLOR_VARS.map((v) => v.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("every default palette covers every declared variable", () => {
    for (const name of THEME_COLOR_VAR_NAMES) {
      expect(DEFAULT_DARK_COLORS).toHaveProperty(name);
      expect(DEFAULT_LIGHT_COLORS).toHaveProperty(name);
    }
  });

  it("every default color value is itself valid", () => {
    for (const value of Object.values(DEFAULT_DARK_COLORS)) expect(isValidCssColor(value)).toBe(true);
    for (const value of Object.values(DEFAULT_LIGHT_COLORS)) expect(isValidCssColor(value)).toBe(true);
  });
});

describe("defaultColorsFor", () => {
  it("returns the dark palette for 'dark'", () => {
    expect(defaultColorsFor("dark")).toBe(DEFAULT_DARK_COLORS);
  });

  it("returns the light palette for 'light'", () => {
    expect(defaultColorsFor("light")).toBe(DEFAULT_LIGHT_COLORS);
  });
});

describe("isValidCssColor", () => {
  it("accepts hex colors of every valid length", () => {
    expect(isValidCssColor("#fff")).toBe(true);
    expect(isValidCssColor("#ffff")).toBe(true);
    expect(isValidCssColor("#ffffff")).toBe(true);
    expect(isValidCssColor("#ffffffff")).toBe(true);
    expect(isValidCssColor("#FFF")).toBe(true);
  });

  it("accepts rgb/rgba/hsl/hsla functional colors", () => {
    expect(isValidCssColor("rgb(0, 0, 0)")).toBe(true);
    expect(isValidCssColor("rgba(0, 0, 0, 0.5)")).toBe(true);
    expect(isValidCssColor("hsl(200, 50%, 50%)")).toBe(true);
    expect(isValidCssColor("hsla(200, 50%, 50%, 0.5)")).toBe(true);
  });

  it("accepts transparent/currentColor, case-insensitively", () => {
    expect(isValidCssColor("transparent")).toBe(true);
    expect(isValidCssColor("currentColor")).toBe(true);
    expect(isValidCssColor("CURRENTCOLOR")).toBe(true);
  });

  it("rejects an empty or whitespace-only value", () => {
    expect(isValidCssColor("")).toBe(false);
    expect(isValidCssColor("   ")).toBe(false);
  });

  it("rejects malformed hex", () => {
    expect(isValidCssColor("#ff")).toBe(false);
    expect(isValidCssColor("#gggggg")).toBe(false);
  });

  it("rejects a named color outside the accepted keyword set", () => {
    expect(isValidCssColor("red")).toBe(false);
    expect(isValidCssColor("cornflowerblue")).toBe(false);
  });

  it("rejects arbitrary non-color text", () => {
    expect(isValidCssColor("not a color")).toBe(false);
  });
});
