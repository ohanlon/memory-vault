import { useEffect, useRef, useState } from "react";

interface Props {
  title: string;
  message: string;
  confirmLabel?: string;
  onConfirm: (dontAskAgain: boolean) => void;
  onCancel: () => void;
}

export function ConfirmModal({ title, message, confirmLabel = "OK", onConfirm, onCancel }: Props) {
  const [dontAskAgain, setDontAskAgain] = useState(false);
  const confirmRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    confirmRef.current?.focus();
  }, []);

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div
        className="modal-box"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === "Escape") onCancel();
        }}
      >
        <h3>{title}</h3>
        <p className="modal-message">{message}</p>
        <label className="modal-checkbox">
          <input
            type="checkbox"
            checked={dontAskAgain}
            onChange={(e) => setDontAskAgain(e.target.checked)}
          />
          Don't ask me again
        </label>
        <div className="modal-actions">
          <button type="button" onClick={onCancel}>
            Cancel
          </button>
          <button ref={confirmRef} type="button" onClick={() => onConfirm(dontAskAgain)}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
