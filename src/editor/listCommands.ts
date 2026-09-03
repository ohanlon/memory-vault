import type { EditorState, TransactionSpec } from "@codemirror/state";

/** Wraps the selection in open/close markers, or inserts an empty pair with the cursor placed inside if nothing's selected. */
function wrapSelectionSpec(state: EditorState, open: string, close: string = open): TransactionSpec {
  const sel = state.selection.main;
  if (sel.empty) {
    return { changes: { from: sel.from, insert: open + close }, selection: { anchor: sel.from + open.length } };
  }
  const text = state.sliceDoc(sel.from, sel.to);
  return {
    changes: { from: sel.from, to: sel.to, insert: `${open}${text}${close}` },
    selection: { anchor: sel.to + open.length + close.length },
  };
}

export function linkCommandSpec(state: EditorState): TransactionSpec {
  return wrapSelectionSpec(state, "[[", "]]");
}

export function boldSpec(state: EditorState): TransactionSpec {
  return wrapSelectionSpec(state, "**");
}

export function italicSpec(state: EditorState): TransactionSpec {
  return wrapSelectionSpec(state, "*");
}

export function strikethroughSpec(state: EditorState): TransactionSpec {
  return wrapSelectionSpec(state, "~~");
}

export function highlightSpec(state: EditorState): TransactionSpec {
  return wrapSelectionSpec(state, "==");
}

export function subscriptSpec(state: EditorState): TransactionSpec {
  return wrapSelectionSpec(state, "~");
}

// Checked in this order — a task item's "- [ ] " would also match the plain
// bullet pattern, so the more specific task pattern has to be tried first.
const TASK_MARKER_RE = /^(\s*)[-*+]\s+\[[ xX]\]\s+/;
const ORDERED_MARKER_RE = /^(\s*)\d+[.)]\s+/;
const UNORDERED_MARKER_RE = /^(\s*)[-*+]\s+/;

/** The existing indent + list marker (if any) at the start of a line, so it can be replaced rather than doubled up. */
function existingMarker(lineText: string): { length: number; indent: string } {
  for (const re of [TASK_MARKER_RE, ORDERED_MARKER_RE, UNORDERED_MARKER_RE]) {
    const m = re.exec(lineText);
    if (m) return { length: m[0].length, indent: m[1] };
  }
  return { length: 0, indent: "" };
}

/**
 * Prefixes every line the selection touches (or just the current line, if
 * nothing's selected) with a marker — replacing any existing list marker
 * (of any of the three types) rather than stacking a new one in front of it,
 * so switching a selection from one list type to another just changes it in place.
 */
function prefixLines(state: EditorState, marker: (lineIndex: number) => string): TransactionSpec {
  const sel = state.selection.main;
  const fromLine = state.doc.lineAt(sel.from).number;
  const toLine = state.doc.lineAt(sel.to).number;
  const changes: { from: number; to: number; insert: string }[] = [];
  for (let n = fromLine; n <= toLine; n++) {
    const line = state.doc.line(n);
    const existing = existingMarker(line.text);
    changes.push({ from: line.from, to: line.from + existing.length, insert: existing.indent + marker(n - fromLine) });
  }

  // A single empty line has nothing to preserve a cursor position relative
  // to, so land right after the inserted marker, ready to type — rather
  // than wherever the mapped (empty) old selection happens to end up.
  if (fromLine === toLine && state.doc.line(fromLine).length === 0) {
    const inserted = changes[0].insert;
    return { changes, selection: { anchor: state.doc.line(fromLine).from + inserted.length } };
  }

  return { changes };
}

export function orderedListSpec(state: EditorState): TransactionSpec {
  return prefixLines(state, (i) => `${i + 1}. `);
}

export function unorderedListSpec(state: EditorState): TransactionSpec {
  return prefixLines(state, () => "- ");
}

export function taskListSpec(state: EditorState): TransactionSpec {
  return prefixLines(state, () => "- [ ] ");
}
