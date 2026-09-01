import { useState } from "react";
import type { PropertyRules, PropertyType } from "@shared/types";

interface Props {
  type: PropertyType;
  value: unknown;
  rules?: PropertyRules;
  onChange: (value: unknown) => void;
  readOnly?: boolean;
}

export function PropertyValueInput({ type, value, rules, onChange, readOnly = false }: Props) {
  switch (type) {
    case "text":
      return (
        <input
          type="text"
          value={typeof value === "string" ? value : ""}
          maxLength={rules?.maxLength}
          onChange={(e) => onChange(e.target.value)}
          disabled={readOnly}
        />
      );
    case "number":
      return (
        <input
          type="number"
          value={typeof value === "number" ? value : ""}
          min={rules?.min}
          max={rules?.max}
          step={rules?.integerOnly ? 1 : "any"}
          onChange={(e) => {
            const raw = e.target.value;
            onChange(raw === "" ? undefined : Number(raw));
          }}
          disabled={readOnly}
        />
      );
    case "checkbox":
      return (
        <input
          type="checkbox"
          checked={value === true}
          onChange={(e) => onChange(e.target.checked)}
          disabled={readOnly}
        />
      );
    case "date":
      return (
        <input
          type="date"
          value={typeof value === "string" ? value : ""}
          onChange={(e) => onChange(e.target.value)}
          disabled={readOnly}
        />
      );
    case "datetime":
      return (
        <input
          type="datetime-local"
          value={typeof value === "string" ? value : ""}
          onChange={(e) => onChange(e.target.value)}
          disabled={readOnly}
        />
      );
    case "list":
      return <ListValueInput value={Array.isArray(value) ? value : []} onChange={onChange} readOnly={readOnly} />;
  }
}

function ListValueInput({
  value,
  onChange,
  readOnly = false,
}: {
  value: unknown[];
  onChange: (v: string[]) => void;
  readOnly?: boolean;
}) {
  const [draft, setDraft] = useState("");
  const items = value.filter((v): v is string => typeof v === "string");

  function commitDraft() {
    const trimmed = draft.trim();
    if (trimmed) onChange([...items, trimmed]);
    setDraft("");
  }

  return (
    <div className="property-list-input">
      <ul className="tag-list tag-list-vertical">
        {items.map((item, i) => (
          <li key={`${item}-${i}`}>
            <span className="tag-chip">
              {item}
              {!readOnly && (
                <button
                  type="button"
                  className="property-list-remove"
                  onClick={() => onChange(items.filter((_, idx) => idx !== i))}
                >
                  ×
                </button>
              )}
            </span>
          </li>
        ))}
      </ul>
      {!readOnly && (
        <input
          type="text"
          value={draft}
          placeholder="Add value..."
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault();
              commitDraft();
            }
          }}
          onBlur={commitDraft}
        />
      )}
    </div>
  );
}
