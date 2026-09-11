import type { EditorState } from "@codemirror/state";
import { RegExpCursor, SearchCursor, type SearchQuery } from "@codemirror/search";

export interface SearchMatch {
  from: number;
  to: number;
  /** Present only for a regex query — carries the capture groups a replacement's $1/$2/etc refer to. */
  match?: RegExpExecArray;
}

const WORD_CHAR_RE = /\w/;

/** Turns a query's literal replace text into what should actually be inserted — mirrors @codemirror/search's own $1/$&/$$ substitution for a regex query, since that isn't part of its public API. */
export function computeReplacement(query: SearchQuery, match?: RegExpExecArray): string {
  const unquoted = query.literal
    ? query.replace
    : query.replace.replace(/\\([nrt\\])/g, (_, ch: string) => (ch === "n" ? "\n" : ch === "r" ? "\r" : ch === "t" ? "\t" : "\\"));
  if (!query.regexp || !match) return unquoted;
  return unquoted.replace(/\$([$&]|\d+)/g, (whole, group: string) => {
    if (group === "&") return match[0];
    if (group === "$") return "$";
    for (let len = group.length; len > 0; len--) {
      const n = Number(group.slice(0, len));
      if (n > 0 && n < match.length) return match[n] + group.slice(len);
    }
    return whole;
  });
}

function passesWholeWord(query: SearchQuery, state: EditorState, from: number, to: number): boolean {
  if (!query.wholeWord) return true;
  const before = from > 0 ? state.sliceDoc(from - 1, from) : "";
  const after = to < state.doc.length ? state.sliceDoc(to, to + 1) : "";
  return !WORD_CHAR_RE.test(before) && !WORD_CHAR_RE.test(after);
}

/** Every match of `query` within [from, to), in document order. */
export function findMatchesInRange(query: SearchQuery, state: EditorState, from: number, to: number): SearchMatch[] {
  const results: SearchMatch[] = [];
  if (!query.valid) return results;
  if (query.regexp) {
    const cursor = new RegExpCursor(state.doc, query.search, { ignoreCase: !query.caseSensitive }, from, to);
    while (!cursor.next().done) {
      if (passesWholeWord(query, state, cursor.value.from, cursor.value.to)) {
        results.push({ from: cursor.value.from, to: cursor.value.to, match: cursor.value.match });
      }
    }
  } else {
    const search = query.literal
      ? query.search
      : query.search.replace(/\\([nrt\\])/g, (_, ch: string) => (ch === "n" ? "\n" : ch === "r" ? "\r" : ch === "t" ? "\t" : "\\"));
    const normalize = query.caseSensitive ? undefined : (s: string) => s.toLowerCase();
    const cursor = new SearchCursor(state.doc, search, from, to, normalize);
    while (!cursor.next().done) {
      if (passesWholeWord(query, state, cursor.value.from, cursor.value.to)) {
        results.push({ from: cursor.value.from, to: cursor.value.to });
      }
    }
  }
  return results;
}

/** The match after `headPos` in `matches` (sorted, ascending), wrapping to the first match if there isn't one. */
export function nextMatch(matches: SearchMatch[], headPos: number): SearchMatch | null {
  if (matches.length === 0) return null;
  return matches.find((m) => m.from >= headPos) ?? matches[0];
}

/** The match before `headPos` in `matches` (sorted, ascending), wrapping to the last match if there isn't one. */
export function previousMatch(matches: SearchMatch[], headPos: number): SearchMatch | null {
  if (matches.length === 0) return null;
  for (let i = matches.length - 1; i >= 0; i--) {
    if (matches[i].to <= headPos) return matches[i];
  }
  return matches[matches.length - 1];
}
