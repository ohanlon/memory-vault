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

export function superscriptSpec(state: EditorState): TransactionSpec {
  return wrapSelectionSpec(state, "^");
}

export function subscriptSpec(state: EditorState): TransactionSpec {
  return wrapSelectionSpec(state, "~");
}

const HEADING_MARKER_RE = /^#{1,6}\s+/;
const QUOTE_MARKER_RE = /^>\s?/;

/** The existing heading or blockquote marker (if any) at the start of a line, so it can be replaced rather than doubled up. */
function existingParagraphMarker(lineText: string): number {
  const heading = HEADING_MARKER_RE.exec(lineText);
  if (heading) return heading[0].length;
  const quote = QUOTE_MARKER_RE.exec(lineText);
  if (quote) return quote[0].length;
  return 0;
}

/**
 * Sets every line the selection touches (or just the current line, if
 * nothing's selected) to a paragraph-level type — a heading, blockquote, or
 * plain body text (empty marker) — replacing any existing heading/blockquote
 * marker rather than stacking a new one in front of it.
 */
function setParagraphType(state: EditorState, marker: string): TransactionSpec {
  const sel = state.selection.main;
  const fromLine = state.doc.lineAt(sel.from).number;
  const toLine = state.doc.lineAt(sel.to).number;
  const changes: { from: number; to: number; insert: string }[] = [];
  for (let n = fromLine; n <= toLine; n++) {
    const line = state.doc.line(n);
    const existingLength = existingParagraphMarker(line.text);
    changes.push({ from: line.from, to: line.from + existingLength, insert: marker });
  }

  // Same rationale as prefixLines below: land the cursor right after the
  // marker on a single empty line, rather than wherever it maps to by default.
  if (marker && fromLine === toLine && state.doc.line(fromLine).length === 0) {
    return { changes, selection: { anchor: state.doc.line(fromLine).from + marker.length } };
  }

  return { changes };
}

export function heading1Spec(state: EditorState): TransactionSpec {
  return setParagraphType(state, "# ");
}

export function heading2Spec(state: EditorState): TransactionSpec {
  return setParagraphType(state, "## ");
}

export function heading3Spec(state: EditorState): TransactionSpec {
  return setParagraphType(state, "### ");
}

export function heading4Spec(state: EditorState): TransactionSpec {
  return setParagraphType(state, "#### ");
}

export function heading5Spec(state: EditorState): TransactionSpec {
  return setParagraphType(state, "##### ");
}

export function heading6Spec(state: EditorState): TransactionSpec {
  return setParagraphType(state, "###### ");
}

export function bodySpec(state: EditorState): TransactionSpec {
  return setParagraphType(state, "");
}

/**
 * Wraps every line the selection touches (or just the current line, if
 * nothing's selected) in a fenced code block — verbatim, unlike the other
 * paragraph types, since markdown syntax inside a code fence is just literal
 * text (e.g. a line that reads "# foo" should keep its "#" as-is). Pass a
 * `language` (a highlight.js id, e.g. "javascript") to open the fence with
 * that info string so it's highlighted as that language; omit it for a
 * plain, language-less block.
 */
export function codeBlockSpec(state: EditorState, language?: string): TransactionSpec {
  const openFence = language ? "```" + language : "```";
  const sel = state.selection.main;
  const startLine = state.doc.lineAt(sel.from);
  const endLine = state.doc.lineAt(sel.to);

  if (startLine.number === endLine.number && startLine.length === 0) {
    const insert = `${openFence}\n\n\`\`\``;
    return { changes: { from: startLine.from, insert }, selection: { anchor: startLine.from + openFence.length + 1 } };
  }

  const content = state.sliceDoc(startLine.from, endLine.to);
  const wrapped = `${openFence}\n${content}\n\`\`\``;
  return {
    changes: { from: startLine.from, to: endLine.to, insert: wrapped },
    selection: { anchor: startLine.from + wrapped.length },
  };
}

export function quoteSpec(state: EditorState): TransactionSpec {
  return setParagraphType(state, "> ");
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
