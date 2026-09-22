import { useEffect, useState } from "react";
import type { NoteHistoryEntry } from "@shared/types";

interface Props {
  notePath: string;
  onClose: () => void;
  onRestore: (timestamp: string) => void;
}

export function HistoryPanel({ notePath, onClose, onRestore }: Props) {
  const [versions, setVersions] = useState<NoteHistoryEntry[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    window.memoryStack.getNoteHistory(notePath).then((v) => {
      if (cancelled) return;
      setVersions(v);
      setSelected(v[0]?.timestamp ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, [notePath]);

  useEffect(() => {
    if (!selected) {
      setPreview(null);
      return;
    }
    let cancelled = false;
    setPreview(null);
    window.memoryStack.readNoteHistoryVersion(notePath, selected).then((content) => {
      if (!cancelled) setPreview(content);
    });
    return () => {
      cancelled = true;
    };
  }, [notePath, selected]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box modal-box-wide history-panel" onClick={(e) => e.stopPropagation()}>
        <h3>Version History</h3>
        {versions === null ? (
          <p className="modal-message">Loading…</p>
        ) : versions.length === 0 ? (
          <p className="modal-message">
            No previous versions recorded yet — a snapshot is taken automatically whenever this note is overwritten
            or deleted.
          </p>
        ) : (
          <div className="history-panel-body">
            <ul className="picker-list history-version-list">
              {versions.map((v) => (
                <li key={v.timestamp}>
                  <button
                    className={`picker-row${v.timestamp === selected ? " picker-row-selected" : ""}`}
                    onClick={() => setSelected(v.timestamp)}
                  >
                    {new Date(v.timestamp).toLocaleString()}
                  </button>
                </li>
              ))}
            </ul>
            <div className="history-version-preview">
              <pre>{preview ?? ""}</pre>
            </div>
          </div>
        )}
        <div className="modal-actions">
          <button type="button" onClick={onClose}>
            Close
          </button>
          {selected && (
            <button type="button" onClick={() => onRestore(selected)}>
              Restore this version
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
