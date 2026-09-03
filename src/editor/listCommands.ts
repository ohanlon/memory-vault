import type { EditorState, TransactionSpec } from "@codemirror/state";

/** Wraps the selection in [[...]], or inserts an empty [[]] with the cursor placed inside if nothing's selected. */
export function linkCommandSpec(state: EditorState): TransactionSpec {
  const sel = state.selection.main;
  if (sel.empty) {
    return { changes: { from: sel.from, insert: "[[]]" }, selection: { anchor: sel.from + 2 } };
  }
  const text = state.sliceDoc(sel.from, sel.to);
  return {
    changes: { from: sel.from, to: sel.to, insert: `[[${text}]]` },
    selection: { anchor: sel.to + 4 },
  };
}

/** Prefixes every line the selection touches (or just the current line, if nothing's selected) with a marker. */
function prefixLines(state: EditorState, marker: (lineIndex: number) => string): TransactionSpec {
  const sel = state.selection.main;
  const fromLine = state.doc.lineAt(sel.from).number;
  const toLine = state.doc.lineAt(sel.to).number;
  const changes: { from: number; insert: string }[] = [];
  for (let n = fromLine; n <= toLine; n++) {
    changes.push({ from: state.doc.line(n).from, insert: marker(n - fromLine) });
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
