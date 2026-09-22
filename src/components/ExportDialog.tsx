import { useEffect, useState } from "react";
import type { ExportFormat } from "../export/vaultExport";

interface Props {
  onExport: (format: ExportFormat) => void;
  onCancel: () => void;
}

const FORMATS: { id: ExportFormat; label: string; description: string }[] = [
  {
    id: "markdown",
    label: "Single Markdown file",
    description: "Every note concatenated into one .md file. Simplest and fully portable, but image references stay relative to the original attachments folder.",
  },
  {
    id: "html",
    label: "Single HTML file",
    description: "Every note rendered and bundled into one self-contained page, with images inlined and internal links working.",
  },
  {
    id: "pdf",
    label: "PDF",
    description: "Same rendering as HTML, printed to a PDF for sharing or printing outside a browser.",
  },
];

export function ExportDialog({ onExport, onCancel }: Props) {
  const [format, setFormat] = useState<ExportFormat>("markdown");

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onCancel();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onCancel]);

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal-box modal-box-wide" onClick={(e) => e.stopPropagation()}>
        <h3>Export Notes Folder</h3>
        <ul className="picker-list">
          {FORMATS.map((f) => (
            <li key={f.id}>
              <button
                className={`picker-row${format === f.id ? " picker-row-selected" : ""}`}
                onClick={() => setFormat(f.id)}
              >
                <span className="picker-summary">
                  <strong>{f.label}</strong>
                  <br />
                  {f.description}
                </span>
              </button>
            </li>
          ))}
        </ul>
        <div className="modal-actions">
          <button type="button" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" onClick={() => onExport(format)}>
            Export
          </button>
        </div>
      </div>
    </div>
  );
}
