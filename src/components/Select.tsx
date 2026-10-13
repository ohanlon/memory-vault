import { useState } from "react";
import { useCompactViewport } from "../useCompactViewport";
import { ContextMenu } from "./ContextMenu";

export interface SelectOption<T extends string> {
  value: T;
  label: string;
}

interface Props<T extends string> {
  value: T;
  options: readonly SelectOption<T>[];
  onChange: (value: T) => void;
  id?: string;
  disabled?: boolean;
  className?: string;
}

const SEGMENTED_MAX = 4;

/**
 * A native <select> on desktop. At phone width a dropdown is replaced by a
 * segmented control (few options) or a button that opens a bottom sheet.
 */
export function Select<T extends string>({ value, options, onChange, id, disabled, className }: Props<T>) {
  const compact = useCompactViewport();
  const [open, setOpen] = useState(false);

  if (!compact) {
    return (
      <select id={id} className={className} value={value} disabled={disabled} onChange={(e) => onChange(e.target.value as T)}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    );
  }

  if (options.length <= SEGMENTED_MAX) {
    return (
      <div id={id} role="radiogroup" className={`segmented${className ? ` ${className}` : ""}`}>
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={o.value === value}
            className={`segmented-option${o.value === value ? " segmented-option-active" : ""}`}
            disabled={disabled}
            onClick={() => onChange(o.value)}
          >
            {o.label}
          </button>
        ))}
      </div>
    );
  }

  const current = options.find((o) => o.value === value);
  return (
    <>
      <button
        id={id}
        type="button"
        className={`select-sheet-btn${className ? ` ${className}` : ""}`}
        disabled={disabled}
        onClick={() => setOpen(true)}
      >
        {current?.label ?? value}
      </button>
      {open && (
        <ContextMenu
          x={0}
          y={0}
          items={options.map((o) => ({
            label: o.label,
            icon: o.value === value ? "✓" : undefined,
            onClick: () => onChange(o.value),
          }))}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
