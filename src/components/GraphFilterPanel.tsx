import { useEffect, useRef } from "react";
import type { GraphFilters } from "@shared/graphFilters";

interface Props {
  filters: GraphFilters;
  onChange: (filters: GraphFilters) => void;
  onClose: () => void;
}

const OPTIONS: { key: keyof GraphFilters; label: string }[] = [
  { key: "internalLinks", label: "Internal links" },
  { key: "externalLinks", label: "External links" },
  { key: "tags", label: "Tags" },
  { key: "attachments", label: "Attachments" },
  { key: "orphaned", label: "Orphaned notes" },
];

export function GraphFilterPanel({ filters, onChange, onClose }: Props) {
  // See ContextMenu.tsx for why onClose is read through a ref with an empty
  // effect dependency array, and why attaching the listeners is deferred.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    function handleDismiss(e: Event) {
      if (e instanceof KeyboardEvent && e.key !== "Escape") return;
      onCloseRef.current();
    }
    const timer = setTimeout(() => {
      window.addEventListener("click", handleDismiss);
      window.addEventListener("keydown", handleDismiss);
    }, 0);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("click", handleDismiss);
      window.removeEventListener("keydown", handleDismiss);
    };
  }, []);

  return (
    <div className="graph-filter-panel" onClick={(e) => e.stopPropagation()}>
      {OPTIONS.map((opt) => (
        <label key={opt.key} className="graph-filter-option">
          <input
            type="checkbox"
            checked={filters[opt.key]}
            onChange={(e) => onChange({ ...filters, [opt.key]: e.target.checked })}
          />
          {opt.label}
        </label>
      ))}
    </div>
  );
}
