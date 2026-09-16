import { EditorView, type ViewUpdate } from "@codemirror/view";

/** True right after typing the second "[" of a wikilink — the same moment
 *  wikilinkAutocomplete.ts's picker first has something to show. */
export function detectWikilinkStart(textBeforeCursor: string): boolean {
  return textBeforeCursor.endsWith("[[");
}

/** Same tag shape as shared/parseNote.ts's INLINE_TAG_RE (not preceded by a
 *  word char, `#`, or `/`, so "issue#123"/"##"/bare numbers don't count) —
 *  checked against the current line only, which is enough to catch a tag as
 *  soon as it's typed without needing the full-note code-span masking that
 *  the real parser applies. */
const INLINE_TAG_RE = /(?<![\w#/])#[a-zA-Z][\w-]*(?:\/[a-zA-Z][\w-]*)*$/;

export function detectInlineTag(lineTextBeforeCursor: string): boolean {
  return INLINE_TAG_RE.test(lineTextBeforeCursor);
}

export interface OnboardingHintCallbacks {
  onWikilinkStarted?: () => void;
  onTagTyped?: () => void;
}

/** Fires the relevant callback the moment a change completes a "[[" or a
 *  "#tag" at the cursor. Callers decide whether it's the first time (and
 *  whatever "show a hint" UI that implies) — this just detects the pattern. */
export function onboardingHints(callbacks: OnboardingHintCallbacks) {
  return EditorView.updateListener.of((update: ViewUpdate) => {
    if (!update.docChanged || !update.state.selection.main.empty) return;
    const pos = update.state.selection.main.head;
    const line = update.state.doc.lineAt(pos);
    const textBeforeCursor = line.text.slice(0, pos - line.from);
    if (callbacks.onWikilinkStarted && detectWikilinkStart(textBeforeCursor)) callbacks.onWikilinkStarted();
    if (callbacks.onTagTyped && detectInlineTag(textBeforeCursor)) callbacks.onTagTyped();
  });
}
