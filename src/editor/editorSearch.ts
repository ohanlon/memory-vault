import type { EditorView } from "@codemirror/view";
import { keymap } from "@codemirror/view";
import { openSearchPanel, search, searchKeymap } from "@codemirror/search";
import { createSearchPanel, requestFindOnly, requestReplaceOnOpen } from "./searchPanel";

/** The find/replace panel — see searchPanel.ts for the custom UI (match case/whole word/regexp/in-selection toggles, replace on its own row). */
export function searchExtension() {
  return search({ createPanel: createSearchPanel });
}

/** Opens the search panel with its replace row hidden, hiding it if a prior Find & Replace had revealed it on an already-open panel. */
export function openSearchPanelForFind(view: EditorView): boolean {
  requestFindOnly(view);
  openSearchPanel(view);
  return true;
}

/** Opens the search panel with its replace row revealed and focused, instead of the find-only row openSearchPanelForFind shows by default. */
export function openSearchPanelForReplace(view: EditorView): boolean {
  requestReplaceOnOpen(view);
  openSearchPanel(view);
  return true;
}

// Mod-f/Mod-r both override the library's own searchKeymap binding (which
// only opens the panel, plain) so switching between Find and Find & Replace
// on an already-open panel also toggles the replace row's visibility,
// matching the app's separate Find (Ctrl/Cmd-F) vs Find & Replace
// (Ctrl/Cmd-R) entry points.
export function editorSearchKeymap() {
  return keymap.of([
    { key: "Mod-f", run: openSearchPanelForFind, preventDefault: true },
    { key: "Mod-r", run: openSearchPanelForReplace, preventDefault: true },
    ...searchKeymap,
  ]);
}
