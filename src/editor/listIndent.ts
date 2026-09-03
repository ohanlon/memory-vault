import { indentWithTab } from "@codemirror/commands";
import { keymap } from "@codemirror/view";

// basicSetup's defaultKeymap deliberately leaves Tab unbound (so it doesn't
// trap keyboard focus unless opted into) — this is what makes Tab/Shift-Tab
// indent/outdent the current line, which is how nested list items (and
// blockquotes, code blocks, etc.) get indented in the editor.
export function listIndentKeymap() {
  return keymap.of([indentWithTab]);
}
