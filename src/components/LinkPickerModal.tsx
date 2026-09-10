import { useMemo, useState } from "react";
import type { FormEvent } from "react";
import type { PickableNote } from "../editor/editorContextMenu";
import { ExternalLinkIcon, PageIcon } from "./icons";

type LinkTarget = { kind: "note"; note: PickableNote } | { kind: "external"; url: string };

interface Props {
  notes: PickableNote[];
  /** Pre-fills the display-text field — typically the text selected in the editor when the picker was opened. */
  initialDisplayText: string;
  onSelectNote: (note: PickableNote, displayText: string) => void;
  onSelectExternal: (url: string, displayText: string) => void;
  onCancel: () => void;
}

function sameTarget(a: LinkTarget | null, b: LinkTarget): boolean {
  if (!a) return false;
  if (a.kind === "note" && b.kind === "note") return a.note.title === b.note.title && a.note.sourceStack === b.note.sourceStack;
  return a.kind === "external" && b.kind === "external" && a.url === b.url;
}

/** "Title (Stack)" when the note came from a specific stack (an open Cairn merges more than one), otherwise just "Title". */
function noteLabel(note: PickableNote): string {
  return note.sourceStack ? `${note.title} (${note.sourceStack})` : note.title;
}

export function LinkPickerModal({ notes, initialDisplayText, onSelectNote, onSelectExternal, onCancel }: Props) {
  const [query, setQuery] = useState("");
  const [displayText, setDisplayText] = useState(initialDisplayText);
  const [target, setTarget] = useState<LinkTarget | null>(null);

  const trimmedQuery = query.trim();

  const filtered = useMemo(() => {
    if (!trimmedQuery) return notes;
    const q = trimmedQuery.toLowerCase();
    return notes.filter((n) => n.title.toLowerCase().includes(q));
  }, [notes, trimmedQuery]);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!target) return;
    if (target.kind === "note") onSelectNote(target.note, displayText.trim());
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
          {filtered.map((note) => (
            <li key={`${note.sourceStack ?? ""}/${note.title}`}>
              <button
                type="button"
                className={`picker-row${sameTarget(target, { kind: "note", note }) ? " picker-row-selected" : ""}`}
                onClick={() => setTarget({ kind: "note", note })}
              >
                <span className="picker-type">
                  <span className="picker-type-icon">
                    <PageIcon />
                  </span>
                  Page
                </span>
                <span className="picker-summary">{noteLabel(note)}</span>
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
