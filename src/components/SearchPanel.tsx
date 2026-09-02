import { useEffect, useRef, useState } from "react";
import { buildSearchRegExp } from "@shared/search";
import type { Note, SearchFileResult, SearchMode } from "@shared/types";

interface Props {
  root: string;
  notes: Note[];
  onSelect: (note: Note) => void;
}

const DEBOUNCE_MS = 200;

export function SearchPanel({ root, notes, onSelect }: Props) {
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<SearchMode>("plain");
  const [wholeWord, setWholeWord] = useState(false);
  const [results, setResults] = useState<SearchFileResult[]>([]);
  const [searching, setSearching] = useState(false);

  const searchIdRef = useRef<string | null>(null);

  // Live-updates the currently visible search results as they stream in;
  // stale events (from a superseded search) are dropped by id comparison.
  useEffect(() => {
    const offResult = window.memoryStack.onSearchResult(({ searchId, result }) => {
      if (searchId !== searchIdRef.current) return;
      setResults((prev) => [...prev, result]);
    });
    const offDone = window.memoryStack.onSearchDone(({ searchId }) => {
      if (searchId !== searchIdRef.current) return;
      setSearching(false);
    });
    return () => {
      offResult();
      offDone();
    };
  }, []);

  useEffect(() => {
    setResults([]);
    setSearching(false);
    searchIdRef.current = null;
  }, [root]);

  const invalidRegex = mode === "regex" && buildSearchRegExp({ query, mode, wholeWord }) === null && query !== "";

  useEffect(() => {
    const prevSearchId = searchIdRef.current;
    if (prevSearchId) window.memoryStack.cancelSearch(prevSearchId);
    searchIdRef.current = null;
    setResults([]);
    setSearching(false);

    if (!query || invalidRegex) return;

    const timer = window.setTimeout(async () => {
      const searchId = await window.memoryStack.startSearch({ query, mode, wholeWord });
      searchIdRef.current = searchId;
      setSearching(true);
    }, DEBOUNCE_MS);

    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, mode, wholeWord]);

  const totalMatches = results.reduce((sum, r) => sum + r.matches.length, 0);

  return (
    <div className="search-panel">
      <input
        type="text"
        className="search-input"
        placeholder="Search notes..."
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <div className="search-options">
        <label className="search-option">
          <input
            type="checkbox"
            checked={mode === "regex"}
            onChange={(e) => setMode(e.target.checked ? "regex" : "plain")}
          />
          Regex
        </label>
        <label className="search-option">
          <input
            type="checkbox"
            checked={wholeWord}
            disabled={mode === "regex"}
            onChange={(e) => setWholeWord(e.target.checked)}
          />
          Whole word
        </label>
      </div>

      {invalidRegex && <p className="backlinks-empty">Invalid regular expression</p>}
      {!invalidRegex && !query && <p className="backlinks-empty">Type to search across all notes</p>}
      {!invalidRegex && query && results.length === 0 && !searching && (
        <p className="backlinks-empty">No matches</p>
      )}

      {results.length > 0 && (
        <p className="search-summary">
          {totalMatches} match{totalMatches === 1 ? "" : "es"} in {results.length} note
          {results.length === 1 ? "" : "s"}
          {searching ? "…" : ""}
        </p>
      )}

      <ul className="search-results">
        {results.map((result) => (
          <li key={result.path} className="search-result-file">
            <button
              className="search-result-title"
              onClick={() => {
                const note = notes.find((n) => n.path === result.path);
                if (note) onSelect(note);
              }}
            >
              {result.title}
            </button>
            <ul className="search-result-matches">
              {result.matches.map((m, i) => (
                <li key={i} className="search-result-match">
                  {m.lineText.slice(0, m.start)}
                  <mark>{m.lineText.slice(m.start, m.end)}</mark>
                  {m.lineText.slice(m.end)}
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </div>
  );
}
