export interface ShortcutEntry {
  id: string;
  label: string;
  /** Display form, e.g. "Mod-B" — "Mod" is Cmd on macOS, Ctrl elsewhere. */
  keys: string;
  /** Where this shortcut applies, shown as a group heading in the reference panel. */
  context: string;
}

// Single source of truth for shortcut *labels* shown in ShortcutsPanel.
// The actual key bindings live where they're implemented (formatShortcuts.ts,
// FileTree.tsx, App.tsx, TabBar.tsx) — this registry doesn't wire up
// behavior, it just documents it for the help panel.
export const SHORTCUTS: ShortcutEntry[] = [
  { id: "bold", label: "Bold", keys: "Mod-B", context: "Editor" },
  { id: "italic", label: "Italic", keys: "Mod-I", context: "Editor" },
  { id: "underline", label: "Underline", keys: "Mod-U", context: "Editor" },
  { id: "rename", label: "Rename note/folder", keys: "F2", context: "File tree" },
  { id: "delete", label: "Delete note/folder", keys: "Delete", context: "File tree" },
];
