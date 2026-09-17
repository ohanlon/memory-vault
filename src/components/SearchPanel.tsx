import { useEffect, useRef, useState } from "react";
import { buildSearchRegExp } from "@shared/search";
import type { Note, SearchFileResult, SearchMode } from "@shared/types";

interface Props {
  /** Identifies the open notes folder — clears stale results when it changes. */
  sessionKey: string;
  notes: Note[];
  onSelect: (note: Note) => void;
}

const DEBOUNCE_MS = 200;

export function SearchPanel({ sessionKey, notes, onSelect }: Props) {
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<SearchMode>("plain");
  const [wholeWord, setWholeWord] = useState(false);
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [results, setResults] = useState<SearchFileResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [showReplace, setShowReplace] = useState(false);
  const [replaceText, setReplaceText] = useState("");
  const [replacing, setReplacing] = useState(false);

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
  }, [sessionKey]);

  const invalidRegex =
    mode === "regex" && buildSearchRegExp({ query, mode, wholeWord, caseSensitive }) === null && query !== "";

  useEffect(() => {
    const prevSearchId = searchIdRef.current;
    if (prevSearchId) window.memoryStack.cancelSearch(prevSearchId);
    searchIdRef.current = null;
    setResults([]);
    setSearching(false);

    if (!query || invalidRegex) return;

    const timer = window.setTimeout(async () => {
      const searchId = await window.memoryStack.startSearch({ query, mode, wholeWord, caseSensitive });
      searchIdRef.current = searchId;
      setSearching(true);
    }, DEBOUNCE_MS);

    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, mode, wholeWord, caseSensitive]);

  // Re-runs the search immediately (no debounce) once a replace finishes, since the
  // replaced files are rewritten on disk out from under the streamed results above.
  async function refreshAfterReplace() {
    const prevSearchId = searchIdRef.current;
    if (prevSearchId) window.memoryStack.cancelSearch(prevSearchId);
    searchIdRef.current = null;
    setResults([]);
    setSearching(false);

    if (!query || invalidRegex) return;

    const searchId = await window.memoryStack.startSearch({ query, mode, wholeWord, caseSensitive });
    searchIdRef.current = searchId;
    setSearching(true);
  }

  async function handleReplaceAll() {
    if (!query || invalidRegex || replacing) return;
    setReplacing(true);
    await window.memoryStack.replaceAll({ query, mode, wholeWord, caseSensitive }, replaceText);
    setReplacing(false);
    await refreshAfterReplace();
  }

  const totalMatches = results.reduce((sum, r) => sum + r.matches.length, 0);

  return (
    <div className="search-panel">
      <div className="search-input-row">
        <button
          type="button"
          className="cairn-search-icon-btn"
          aria-label={showReplace ? "Hide replace" : "Show replace"}
          title={showReplace ? "Hide replace" : "Show replace"}
          onClick={() => setShowReplace((v) => !v)}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ transform: showReplace ? "rotate(90deg)" : "none" }}
          >
            <path d="M9 5L16 12L9 19" />
          </svg>
        </button>
        <input
          type="text"
          className="search-input"
          placeholder="Search notes..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button
          type="button"
          className="cairn-search-toggle"
          aria-pressed={caseSensitive}
          aria-label="Match case"
          title="Match case"
          onClick={() => setCaseSensitive((v) => !v)}
        >
          Aa
        </button>
        <button
          type="button"
          className="cairn-search-toggle"
          aria-pressed={wholeWord}
          aria-label="Whole word"
          title="Whole word"
          disabled={mode === "regex"}
          onClick={() => setWholeWord((v) => !v)}
        >
          ab
        </button>
        <button
          type="button"
          className="cairn-search-toggle"
          aria-pressed={mode === "regex"}
          aria-label="Regular expression"
          title="Regular expression"
          onClick={() => setMode((m) => (m === "regex" ? "plain" : "regex"))}
        >
          .*
        </button>
      </div>

      {showReplace && (
        <div className="cairn-search-row">
          <div className="search-input-row-spacer" aria-hidden="true" />
          <input
            type="text"
            className="search-input"
            placeholder="Replace"
            aria-label="Replace"
            value={replaceText}
            onChange={(e) => setReplaceText(e.target.value)}
          />
          <button
            type="button"
            className="cairn-search-text-btn"
            disabled={!query || invalidRegex || replacing}
            onClick={handleReplaceAll}
          >
            Replace All
          </button>
        </div>
      )}

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
