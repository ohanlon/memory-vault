import type { EditorFontFamily } from "./types";

export const MIN_EDITOR_FONT_SIZE = 10;
export const MAX_EDITOR_FONT_SIZE = 28;

/** CSS font-family stacks for each option — all but "system-ui"/"monospace" are bundled webfonts (see src/main.tsx). */
export const EDITOR_FONT_STACKS: Record<EditorFontFamily, string> = {
  "system-ui": '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  roboto: '"Roboto", -apple-system, BlinkMacSystemFont, "Segoe UI", Arimo, sans-serif',
  arimo: '"Arimo", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  monospace: '"SFMono-Regular", Consolas, monospace',
  "open-sans": '"Open Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  montserrat: '"Montserrat", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  "google-sans": '"Google Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  "scoutie-sans": '"Scoutie Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  "valley-sans": '"Valley Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
};

export const EDITOR_FONT_OPTIONS: { value: EditorFontFamily; label: string }[] = [
  { value: "system-ui", label: "System Default" },
  { value: "roboto", label: "Roboto" },
  { value: "arimo", label: "Arimo" },
  { value: "monospace", label: "Monospace" },
  { value: "open-sans", label: "Open Sans" },
  { value: "montserrat", label: "Montserrat" },
  { value: "google-sans", label: "Google Sans" },
  { value: "scoutie-sans", label: "Scoutie Sans" },
  { value: "valley-sans", label: "Valley Sans" },
];
