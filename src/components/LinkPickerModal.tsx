import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import { ExternalLinkIcon, PageIcon } from "./icons";

interface Props {
  noteTitles: string[];
  onSelectNote: (title: string) => void;
  onSelectExternal: (url: string) => void;
  onCancel: () => void;
}

export function LinkPickerModal({ noteTitles, onSelectNote, onSelectExternal, onCancel }: Props) {
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const trimmedQuery = query.trim();

  const filtered = useMemo(() => {
    if (!trimmedQuery) return noteTitles;
    const q = trimmedQuery.toLowerCase();
    return noteTitles.filter((t) => t.toLowerCase().includes(q));
  }, [noteTitles, trimmedQuery]);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (filtered.length > 0) onSelectNote(filtered[0]);
    else if (trimmedQuery) onSelectExternal(trimmedQuery);
  }

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <form className="modal-box modal-box-wide" onClick={(e) => e.stopPropagation()} onSubmit={handleSubmit}>
        <h3>Insert Link</h3>
        <input
          ref={inputRef}
          placeholder="Search pages, or type a URL…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") onCancel();
          }}
        />
        <ul className="picker-list">
          {trimmedQuery && (
            <li>
              <button type="button" className="picker-row" onClick={() => onSelectExternal(trimmedQuery)}>
                <span className="picker-type">
                  <span className="picker-type-icon">
                    <ExternalLinkIcon />
                  </span>
                  URL
                </span>
                <span className="picker-summary">{trimmedQuery}</span>
              </button>
            </li>
          )}
          {filtered.map((title) => (
            <li key={title}>
              <button type="button" className="picker-row" onClick={() => onSelectNote(title)}>
                <span className="picker-type">
                  <span className="picker-type-icon">
                    <PageIcon />
                  </span>
                  Page
                </span>
                <span className="picker-summary">{title}</span>
              </button>
            </li>
          ))}
          {filtered.length === 0 && !trimmedQuery && <p className="modal-message">No pages yet.</p>}
        </ul>
        <div className="modal-actions">
          <button type="button" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
