/**
 * Canonical list of every CSS custom property the app themes with, plus the
 * default dark/light palettes. These are hand-kept-in-sync duplicates of the
 * two :root blocks in src/index.css (same tradeoff as TITLE_BAR_OVERLAY_COLORS
 * in electron/main.ts) — update both places together if either changes.
 */

export interface ThemeColorVar {
  name: string;
  group: string;
  label: string;
}

export const THEME_COLOR_VARS: ThemeColorVar[] = [
  // Backgrounds
  { name: "bg-base", group: "Backgrounds", label: "Base background" },
  { name: "bg-recessed", group: "Backgrounds", label: "Recessed background" },
  { name: "bg-sidebar", group: "Backgrounds", label: "Sidebar background" },
  { name: "bg-tabbar", group: "Backgrounds", label: "Tab bar background" },
  { name: "bg-surface", group: "Backgrounds", label: "Surface background" },
  { name: "bg-control", group: "Backgrounds", label: "Control background" },
  { name: "bg-control-hover", group: "Backgrounds", label: "Control background (hover)" },
  { name: "bg-selected", group: "Backgrounds", label: "Selected background" },
  { name: "bg-tag", group: "Backgrounds", label: "Tag background" },
  { name: "bg-wikilink", group: "Backgrounds", label: "Wikilink background" },
  { name: "bg-wikilink-orphan", group: "Backgrounds", label: "Orphan wikilink background" },
  { name: "bg-highlight", group: "Backgrounds", label: "Highlight background" },
  // Scrollbar
  { name: "scrollbar-thumb", group: "Scrollbar", label: "Scrollbar thumb" },
  { name: "scrollbar-thumb-hover", group: "Scrollbar", label: "Scrollbar thumb (hover)" },
  // Borders
  { name: "border-divider", group: "Borders", label: "Divider border" },
  { name: "border-control", group: "Borders", label: "Control border" },
  // Text
  { name: "text-primary", group: "Text", label: "Primary text" },
  { name: "text-secondary", group: "Text", label: "Secondary text" },
  { name: "text-tertiary", group: "Text", label: "Tertiary text" },
  { name: "text-muted", group: "Text", label: "Muted text" },
  { name: "text-faint", group: "Text", label: "Faint text" },
  { name: "text-faintest", group: "Text", label: "Faintest text" },
  { name: "text-quote", group: "Text", label: "Quote text" },
  { name: "text-label", group: "Text", label: "Label text" },
  { name: "text-onbutton", group: "Text", label: "Text on button" },
  { name: "text-strong", group: "Text", label: "Strong text" },
  { name: "text-disabled", group: "Text", label: "Disabled text" },
  // Accents
  { name: "accent-blue", group: "Accents", label: "Blue accent" },
  { name: "accent-purple", group: "Accents", label: "Purple accent" },
  { name: "accent-green", group: "Accents", label: "Green accent" },
  { name: "accent-red", group: "Accents", label: "Red accent" },
  { name: "accent-red-soft", group: "Accents", label: "Red accent (soft)" },
  { name: "accent-violet", group: "Accents", label: "Violet accent" },
  // Shadow / Overlay
  { name: "shadow-menu", group: "Shadow / Overlay", label: "Menu shadow" },
  { name: "overlay-bg", group: "Shadow / Overlay", label: "Overlay background" },
];

export const THEME_COLOR_VAR_NAMES: string[] = THEME_COLOR_VARS.map((v) => v.name);

export const DEFAULT_DARK_COLORS: Record<string, string> = {
  "bg-base": "#1e1f24",
  "bg-recessed": "#1a1b20",
  "bg-sidebar": "#23242b",
  "bg-tabbar": "#202127",
  "bg-surface": "#2a2c38",
  "bg-control": "#35374a",
  "bg-control-hover": "#454868",
  "bg-selected": "#3a3d55",
  "bg-tag": "#3a2d4a",
  "bg-wikilink": "#22304a",
  "bg-wikilink-orphan": "#3a2323",
  "bg-highlight": "#6b5a1f",
  "scrollbar-thumb": "#3a3d55",
  "scrollbar-thumb-hover": "#4a4c68",
  "border-divider": "#33343d",
  "border-control": "#4a4c63",
  "text-primary": "#e6e6e6",
  "text-secondary": "#999",
  "text-tertiary": "#ccc",
  "text-muted": "#888",
  "text-faint": "#777",
  "text-faintest": "#666",
  "text-quote": "#aaa",
  "text-label": "#b6b6c0",
  "text-onbutton": "#ddd",
  "text-strong": "#fff",
  "text-disabled": "#4a4c56",
  "accent-blue": "#6c9bd1",
  "accent-purple": "#a97bd1",
  "accent-green": "#5a9b6e",
  "accent-red": "#e07a7a",
  "accent-red-soft": "#d17b7b",
  "accent-violet": "#7a7dc9",
  "shadow-menu": "rgba(0, 0, 0, 0.4)",
  "overlay-bg": "rgba(0, 0, 0, 0.5)",
};

export const DEFAULT_LIGHT_COLORS: Record<string, string> = {
  "bg-base": "#ffffff",
  "bg-recessed": "#eef0f3",
  "bg-sidebar": "#f7f8fa",
  "bg-tabbar": "#eef0f3",
  "bg-surface": "#f1f2f5",
  "bg-control": "#eceef2",
  "bg-control-hover": "#dfe2e8",
  "bg-selected": "#dbe7fb",
  "bg-tag": "#f1e9fb",
  "bg-wikilink": "#e3edfb",
  "bg-wikilink-orphan": "#fbe4e4",
  "bg-highlight": "#fff3a3",
  "scrollbar-thumb": "#c7cad1",
  "scrollbar-thumb-hover": "#b3b7c1",
  "border-divider": "#e1e3e8",
  "border-control": "#8b909c",
  "text-primary": "#1f2328",
  "text-secondary": "#57606a",
  "text-tertiary": "#4d525c",
  "text-muted": "#6e7781",
  "text-faint": "#7d8590",
  "text-faintest": "#7d8590",
  "text-quote": "#57606a",
  "text-label": "#57606a",
  "text-onbutton": "#24292f",
  "text-strong": "#14171a",
  "text-disabled": "#b6bac2",
  "accent-blue": "#2b6cb0",
  "accent-purple": "#7a4fc2",
  "accent-green": "#2f8552",
  "accent-red": "#c53030",
  "accent-red-soft": "#ae2e24",
  "accent-violet": "#6a63c9",
  "shadow-menu": "rgba(20, 20, 30, 0.15)",
  "overlay-bg": "rgba(15, 15, 20, 0.35)",
};

export function defaultColorsFor(baseMode: "dark" | "light"): Record<string, string> {
  return baseMode === "light" ? DEFAULT_LIGHT_COLORS : DEFAULT_DARK_COLORS;
}

const HEX_COLOR_RE = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const FUNCTIONAL_COLOR_RE = /^(rgb|rgba|hsl|hsla)\([^)]+\)$/i;
const KEYWORD_COLORS = new Set(["transparent", "currentcolor"]);

/**
 * Pure syntax validation for a CSS color value — deliberately not
 * CSS.supports (DOM-only, unavailable in the main process and not reliably
 * testable). Accepts hex (3/4/6/8 digit), rgb()/rgba()/hsl()/hsla(), and
 * transparent/currentColor. Does not validate the full CSS named-color
 * keyword list (e.g. "red") — the app's own values are all hex/rgba already.
 */
export function isValidCssColor(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (HEX_COLOR_RE.test(trimmed)) return true;
  if (FUNCTIONAL_COLOR_RE.test(trimmed)) return true;
  return KEYWORD_COLORS.has(trimmed.toLowerCase());
}
