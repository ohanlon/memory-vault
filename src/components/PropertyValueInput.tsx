import { useState } from "react";
import type { PropertyRules, PropertyType } from "@shared/types";

interface Props {
  type: PropertyType;
  value: unknown;
  rules?: PropertyRules;
  onChange: (value: unknown) => void;
}

export function PropertyValueInput({ type, value, rules, onChange }: Props) {
  switch (type) {
    case "text":
      return (
        <input
          type="text"
          value={typeof value === "string" ? value : ""}
          maxLength={rules?.maxLength}
          onChange={(e) => onChange(e.target.value)}
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
        />
      );
    case "checkbox":
      return (
        <input type="checkbox" checked={value === true} onChange={(e) => onChange(e.target.checked)} />
      );
    case "date":
      return (
        <input
          type="date"
          value={typeof value === "string" ? value : ""}
          onChange={(e) => onChange(e.target.value)}
        />
      );
    case "datetime":
      return (
        <input
          type="datetime-local"
          value={typeof value === "string" ? value : ""}
          onChange={(e) => onChange(e.target.value)}
        />
      );
    case "list":
      return <ListValueInput value={Array.isArray(value) ? value : []} onChange={onChange} />;
  }
}

function ListValueInput({ value, onChange }: { value: unknown[]; onChange: (v: string[]) => void }) {
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
              <button
                type="button"
                className="property-list-remove"
                onClick={() => onChange(items.filter((_, idx) => idx !== i))}
              >
                ×
              </button>
            </span>
          </li>
        ))}
      </ul>
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
    </div>
  );
}
