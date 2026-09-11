import type { EditorView } from "@codemirror/view";
import { keymap } from "@codemirror/view";
import { openSearchPanel, search, searchKeymap } from "@codemirror/search";

/** The built-in search/replace panel — case-sensitive, regexp, and whole-word toggles come with it. */
export function searchExtension() {
  return search();
}

/** Opens the search panel with its replace field focused, instead of the search field openSearchPanel focuses by default. */
export function openSearchPanelForReplace(view: EditorView): boolean {
  openSearchPanel(view);
  view.dom.querySelector<HTMLInputElement>('.cm-search input[name="replace"]')?.focus();
  return true;
}

// Mod-f opens the panel — already bound by the library's own searchKeymap,
// which this extends. Mod-r has no built-in binding, since the library's
// single combined panel always shows both the search and replace fields
// together; this just starts focus on the replace field instead, matching
// the app's separate Find (Ctrl/Cmd-F) vs Find & Replace (Ctrl/Cmd-R) entry
// points.
export function editorSearchKeymap() {
  return keymap.of([...searchKeymap, { key: "Mod-r", run: openSearchPanelForReplace, preventDefault: true }]);
}

export { openSearchPanel };
