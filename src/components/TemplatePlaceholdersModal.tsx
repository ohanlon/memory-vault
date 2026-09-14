import { useEffect, useRef, useState } from "react";

interface Props {
  /** Distinct {{placeholder}} names found in the template, in the order they first appear. */
  placeholders: string[];
  onSubmit: (values: Record<string, string>) => void;
  onCancel: () => void;
}

export function TemplatePlaceholdersModal({ placeholders, onSubmit, onCancel }: Props) {
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(placeholders.map((name) => [name, ""]))
  );
  const firstInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    firstInputRef.current?.focus();
  }, []);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSubmit(values);
  }

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <form className="modal-box" onClick={(e) => e.stopPropagation()} onSubmit={handleSubmit}>
        <h3>Fill in template</h3>
        {placeholders.map((name, i) => (
          <label key={name} className="template-placeholder-field">
            <span>{name}</span>
            <input
              ref={i === 0 ? firstInputRef : undefined}
              value={values[name]}
              onChange={(e) => setValues((v) => ({ ...v, [name]: e.target.value }))}
              onKeyDown={(e) => {
                if (e.key === "Escape") onCancel();
              }}
            />
          </label>
        ))}
        <div className="modal-actions">
          <button type="button" onClick={onCancel}>
            Cancel
          </button>
          <button type="submit">Create</button>
        </div>
      </form>
    </div>
  );
}
