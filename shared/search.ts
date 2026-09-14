import type { SearchMatch, SearchOptions } from "./types";

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Returns null for an empty query or an invalid regex pattern. */
export function buildSearchRegExp(options: SearchOptions): RegExp | null {
  const { query, mode, wholeWord, caseSensitive } = options;
  if (!query) return null;
  const flags = caseSensitive ? "g" : "gi";
  if (mode === "regex") {
    try {
      return new RegExp(query, flags);
    } catch {
      return null;
    }
  }
  const escaped = escapeRegExp(query);
  const pattern = wholeWord ? `\\b${escaped}\\b` : escaped;
  return new RegExp(pattern, flags);
}

export function searchContent(content: string, options: SearchOptions): SearchMatch[] {
  const re = buildSearchRegExp(options);
  if (!re) return [];
  const matches: SearchMatch[] = [];
  const lines = content.split(/\r\n|\r|\n/);
  lines.forEach((lineText, idx) => {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(lineText))) {
      matches.push({ line: idx + 1, lineText, start: m.index, end: m.index + m[0].length });
      if (m[0].length === 0) re.lastIndex += 1; // avoid infinite loop on zero-width matches
    }
  });
  return matches;
}

/** Turns a literal replace string into what should actually be inserted for one match — in regex mode, substitutes $1/$2/$&/$$ against that match's capture groups (plain mode has no groups, so the text is used as-is). */
function computeReplacement(replaceText: string, mode: SearchOptions["mode"], match: RegExpMatchArray): string {
  if (mode !== "regex") return replaceText;
  return replaceText.replace(/\$([$&]|\d+)/g, (whole, group: string) => {
    if (group === "&") return match[0];
    if (group === "$") return "$";
    for (let len = group.length; len > 0; len--) {
      const n = Number(group.slice(0, len));
      if (n > 0 && n < match.length) return (match[n] ?? "") + group.slice(len);
    }
    return whole;
  });
}

/** Replaces every match of `options` in `content` with `replaceText`, returning the updated content and how many matches were replaced. */
export function replaceAllInContent(
  content: string,
  options: SearchOptions,
  replaceText: string
): { content: string; count: number } {
  const re = buildSearchRegExp(options);
  if (!re) return { content, count: 0 };
  const matches = [...content.matchAll(re)];
  if (matches.length === 0) return { content, count: 0 };
  let result = "";
  let lastIndex = 0;
  for (const m of matches) {
    const start = m.index ?? 0;
    result += content.slice(lastIndex, start);
    result += computeReplacement(replaceText, options.mode, m);
    lastIndex = start + m[0].length;
  }
  result += content.slice(lastIndex);
  return { content: result, count: matches.length };
}
