import { THEME_COLOR_VAR_NAMES } from "@shared/themeColors";
import type { CustomTheme } from "@shared/types";

/** Removes every custom-theme CSS variable from el's inline style — a no-op for any that were never set. Safe to call unconditionally before switching to a built-in theme, so nothing leaks across theme switches. */
export function clearCustomThemeProperties(el: HTMLElement): void {
  for (const name of THEME_COLOR_VAR_NAMES) {
    el.style.removeProperty(`--${name}`);
  }
}

/** Applies every one of theme's colors to el's inline style, overriding whichever built-in :root block is otherwise in effect. */
export function applyCustomThemeProperties(el: HTMLElement, theme: CustomTheme): void {
  for (const name of THEME_COLOR_VAR_NAMES) {
    el.style.setProperty(`--${name}`, theme.colors[name]);
  }
}
