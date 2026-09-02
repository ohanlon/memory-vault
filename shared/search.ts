import type { SearchMatch, SearchOptions } from "./types";

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Returns null for an empty query or an invalid regex pattern. */
export function buildSearchRegExp(options: SearchOptions): RegExp | null {
  const { query, mode, wholeWord } = options;
  if (!query) return null;
  if (mode === "regex") {
    try {
      return new RegExp(query, "gi");
    } catch {
      return null;
    }
  }
  const escaped = escapeRegExp(query);
  const pattern = wholeWord ? `\\b${escaped}\\b` : escaped;
  return new RegExp(pattern, "gi");
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
