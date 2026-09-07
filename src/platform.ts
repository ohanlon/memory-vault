// Renderer-only (relies on `navigator`) — the app has no native Electron
// application menu (see electron/main.ts's `Menu.setApplicationMenu(null)`),
// so platform-specific shortcut labels and modifier-key handling are done
// entirely in the renderer rather than via OS-level accelerators.
export const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPod|iPad/.test(navigator.platform);

/** Formats a single-letter shortcut for display, e.g. "C" -> "⌘C" on macOS, "Ctrl+C" elsewhere. */
export function shortcutLabel(key: string, mac: boolean = isMac): string {
  return mac ? `⌘${key.toUpperCase()}` : `Ctrl+${key.toUpperCase()}`;
}

/** True if the given keyboard event matches Cmd+key (macOS) or Ctrl+key (elsewhere). */
export function matchesShortcut(
  e: { key: string; ctrlKey: boolean; metaKey: boolean },
  key: string,
  mac: boolean = isMac
): boolean {
  const mod = mac ? e.metaKey : e.ctrlKey;
  return mod && e.key.toLowerCase() === key.toLowerCase();
}
