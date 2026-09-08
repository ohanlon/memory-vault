import { keymap } from "@codemirror/view";
import type { Command } from "@codemirror/view";
import { boldSpec, italicSpec, underlineSpec } from "./listCommands";

function applySpec(spec: typeof boldSpec): Command {
  return (view) => {
    view.dispatch(spec(view.state));
    return true;
  };
}

// "Mod-" resolves to Cmd on macOS and Ctrl elsewhere (CodeMirror's own
// cross-platform handling), matching Bold/Italic/Underline's universal
// binding across every text editor and word processor. The rest of the
// Format menu (strikethrough, highlight, sub/superscript, code, maths) has
// no shortcut that's standard across editors, so those stay menu-only.
export function formatShortcutsKeymap() {
  return keymap.of([
    { key: "Mod-b", run: applySpec(boldSpec) },
    { key: "Mod-i", run: applySpec(italicSpec) },
    { key: "Mod-u", run: applySpec(underlineSpec) },
  ]);
}
