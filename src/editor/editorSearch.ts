import type { EditorView } from "@codemirror/view";
import { keymap } from "@codemirror/view";
import { openSearchPanel, search, searchKeymap } from "@codemirror/search";
import { createSearchPanel, requestReplaceOnOpen } from "./searchPanel";

/** The find/replace panel — see searchPanel.ts for the custom UI (match case/whole word/regexp/in-selection toggles, replace on its own row). */
export function searchExtension() {
  return search({ createPanel: createSearchPanel });
}

/** Opens the search panel with its replace row revealed and focused, instead of the find-only row openSearchPanel shows by default. */
export function openSearchPanelForReplace(view: EditorView): boolean {
  requestReplaceOnOpen(view);
  openSearchPanel(view);
  return true;
}

// Mod-f opens the panel — already bound by the library's own searchKeymap,
// which this extends. Mod-r has no built-in binding; this reveals the
// replace row (hidden by default) and focuses it, matching the app's
// separate Find (Ctrl/Cmd-F) vs Find & Replace (Ctrl/Cmd-R) entry points.
export function editorSearchKeymap() {
  return keymap.of([...searchKeymap, { key: "Mod-r", run: openSearchPanelForReplace, preventDefault: true }]);
}

export { openSearchPanel };
