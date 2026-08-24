import type { LayoutPrefs } from "./types";

export const MIN_SIDEBAR_WIDTH = 180;
export const MAX_SIDEBAR_WIDTH = 560;

export const DEFAULT_LAYOUT_PREFS: LayoutPrefs = {
  sidebarWidth: 260,
  rightPanelWidth: 340,
};

function clampWidth(value: unknown, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.min(MAX_SIDEBAR_WIDTH, Math.max(MIN_SIDEBAR_WIDTH, value));
}

/** Fills in missing/invalid fields with defaults and clamps to the allowed range. */
export function normalizeLayoutPrefs(value: unknown): LayoutPrefs {
  const raw = (value && typeof value === "object" ? value : {}) as Partial<LayoutPrefs>;
  return {
    sidebarWidth: clampWidth(raw.sidebarWidth, DEFAULT_LAYOUT_PREFS.sidebarWidth),
    rightPanelWidth: clampWidth(raw.rightPanelWidth, DEFAULT_LAYOUT_PREFS.rightPanelWidth),
  };
}
