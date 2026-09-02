import { EditorState } from "@codemirror/state";
import { generateLoremIpsum } from "@shared/loremIpsum";

// Matches right up to the cursor, so it only fires the instant the closing
// "}}" is typed — {{lorem ipsum}} expands to one paragraph, {{lorem ipsum#3}}
// to three, case-insensitively.
const LOREM_TRIGGER_RE = /\{\{lorem ipsum(?:#(\d+))?\}\}$/i;

// closeBrackets (from basicSetup) auto-closes "{" by default, so typing "{{"
// inserts "}}" ahead of the cursor rather than the user typing it — meaning
// loremIpsumExpand's trigger (which only looks at text before the cursor)
// would never see a completed "{{...}}" without this. Excluding "{" from the
// auto-closed set leaves "(", "[", and quotes closing as before.
export function noCurlyBraceAutoClose() {
  return EditorState.languageData.of(() => [{ closeBrackets: { brackets: ["(", "[", "'", '"'] } }]);
}

/** Expands a {{lorem ipsum}} / {{lorem ipsum#N}} snippet in place as it's typed. */
export function loremIpsumExpand() {
  return EditorState.transactionFilter.of((tr) => {
    if (!tr.docChanged || !tr.isUserEvent("input.type")) return tr;

    const pos = tr.newSelection.main.head;
    const line = tr.newDoc.lineAt(pos);
    const textBefore = line.text.slice(0, pos - line.from);
    const match = LOREM_TRIGGER_RE.exec(textBefore);
    if (!match) return tr;

    const count = match[1] ? parseInt(match[1], 10) : 1;
    const matchStart = line.from + match.index;
    const replacement = generateLoremIpsum(count);

    return [
      tr,
      {
        changes: { from: matchStart, to: pos, insert: replacement },
        selection: { anchor: matchStart + replacement.length },
        sequential: true,
      },
    ];
  });
}
