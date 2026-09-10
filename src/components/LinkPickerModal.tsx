import { useMemo, useState } from "react";
import type { FormEvent } from "react";
import { ExternalLinkIcon, PageIcon } from "./icons";

type LinkTarget = { kind: "note"; title: string } | { kind: "external"; url: string };

interface Props {
  noteTitles: string[];
  /** Pre-fills the display-text field — typically the text selected in the editor when the picker was opened. */
  initialDisplayText: string;
  onSelectNote: (title: string, displayText: string) => void;
  onSelectExternal: (url: string, displayText: string) => void;
  onCancel: () => void;
}

function sameTarget(a: LinkTarget | null, b: LinkTarget): boolean {
  if (!a) return false;
  return a.kind === "note" && b.kind === "note" ? a.title === b.title : a.kind === "external" && b.kind === "external" && a.url === b.url;
}

export function LinkPickerModal({ noteTitles, initialDisplayText, onSelectNote, onSelectExternal, onCancel }: Props) {
  const [query, setQuery] = useState("");
  const [displayText, setDisplayText] = useState(initialDisplayText);
  const [target, setTarget] = useState<LinkTarget | null>(null);

  const trimmedQuery = query.trim();

  const filtered = useMemo(() => {
    if (!trimmedQuery) return noteTitles;
    const q = trimmedQuery.toLowerCase();
    return noteTitles.filter((t) => t.toLowerCase().includes(q));
  }, [noteTitles, trimmedQuery]);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!target) return;
    if (target.kind === "note") onSelectNote(target.title, displayText.trim());
    else onSelectExternal(target.url, displayText.trim());
  }

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <form className="modal-box modal-box-wide" onClick={(e) => e.stopPropagation()} onSubmit={handleSubmit}>
        <h3>Insert Link</h3>
        <input
          placeholder="Link text (optional — defaults to the page title or URL)"
          value={displayText}
          onChange={(e) => setDisplayText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") onCancel();
          }}
        />
        <input
          autoFocus
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
              <button
                type="button"
                className={`picker-row${sameTarget(target, { kind: "external", url: trimmedQuery }) ? " picker-row-selected" : ""}`}
                onClick={() => setTarget({ kind: "external", url: trimmedQuery })}
              >
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
              <button
                type="button"
                className={`picker-row${sameTarget(target, { kind: "note", title }) ? " picker-row-selected" : ""}`}
                onClick={() => setTarget({ kind: "note", title })}
              >
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
          <button type="submit" disabled={!target}>
            Insert
          </button>
        </div>
      </form>
    </div>
  );
}
