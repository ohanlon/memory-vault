import { useEffect, useRef, useState } from "react";

interface Props {
  title: string;
  initialValue?: string;
  confirmLabel?: string;
  onSubmit: (value: string) => void;
  onCancel: () => void;
}

export function PromptModal({ title, initialValue = "", confirmLabel = "OK", onSubmit, onCancel }: Props) {
  const [value, setValue] = useState(initialValue);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = value.trim();
    if (trimmed) onSubmit(trimmed);
  }

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <form className="modal-box" onClick={(e) => e.stopPropagation()} onSubmit={handleSubmit}>
        <h3>{title}</h3>
        <input
          ref={inputRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") onCancel();
          }}
        />
        <div className="modal-actions">
          <button type="button" onClick={onCancel}>
            Cancel
          </button>
          <button type="submit">{confirmLabel}</button>
        </div>
      </form>
    </div>
  );
}
