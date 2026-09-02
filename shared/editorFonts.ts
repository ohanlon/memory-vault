import type { EditorFontFamily } from "./types";

export const MIN_EDITOR_FONT_SIZE = 10;
export const MAX_EDITOR_FONT_SIZE = 28;

/** CSS font-family stacks for each option — Roboto/Arimo are bundled webfonts (see src/main.tsx). */
export const EDITOR_FONT_STACKS: Record<EditorFontFamily, string> = {
  "system-ui": '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  roboto: '"Roboto", -apple-system, BlinkMacSystemFont, "Segoe UI", Arimo, sans-serif',
  arimo: '"Arimo", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  monospace: '"SFMono-Regular", Consolas, monospace',
};

export const EDITOR_FONT_OPTIONS: { value: EditorFontFamily; label: string }[] = [
  { value: "system-ui", label: "System Default" },
  { value: "roboto", label: "Roboto" },
  { value: "arimo", label: "Arimo" },
  { value: "monospace", label: "Monospace" },
];
