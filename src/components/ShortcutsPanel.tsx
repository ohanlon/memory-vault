import { SHORTCUTS } from "@shared/shortcuts";

interface Props {
  onReplayTour: () => void;
  onClose: () => void;
}

export function ShortcutsPanel({ onReplayTour, onClose }: Props) {
  const contexts = Array.from(new Set(SHORTCUTS.map((s) => s.context)));

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-box modal-box-wide"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === "Escape") onClose();
        }}
      >
        <h3>Keyboard shortcuts</h3>
        {contexts.map((context) => (
          <div key={context} className="shortcuts-group">
            <h4>{context}</h4>
            <ul className="shortcuts-list">
              {SHORTCUTS.filter((s) => s.context === context).map((s) => (
                <li key={s.id}>
                  <span>{s.label}</span>
                  <kbd>{s.keys}</kbd>
                </li>
              ))}
            </ul>
          </div>
        ))}
        <div className="modal-actions">
          <button type="button" onClick={onReplayTour}>
            Replay tour
          </button>
          <button type="button" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
