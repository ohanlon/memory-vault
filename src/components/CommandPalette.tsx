import { useEffect, useMemo, useRef, useState } from "react";
import { filterCommands, type PaletteCommand } from "./paletteCommands";

interface Props {
  commands: PaletteCommand[];
  onClose: () => void;
}

/** Searchable list of every app command. Full-screen on phones, a centered panel on desktop. */
export function CommandPalette({ commands, onClose }: Props) {
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const results = useMemo(() => filterCommands(commands, query), [commands, query]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  function run(c: PaletteCommand) {
    onClose();
    c.run();
  }

  return (
    <div className="palette-backdrop" onClick={onClose}>
      <div
        className="palette"
        role="dialog"
        aria-label="Command palette"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === "Escape") onClose();
          if (e.key === "Enter" && results[0]) run(results[0]);
        }}
      >
        <div className="palette-header">
          <input
            ref={inputRef}
            className="palette-input"
            type="search"
            placeholder="Type a command…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <button className="palette-close" aria-label="Close" onClick={onClose}>
            ✕
          </button>
        </div>
        <ul className="palette-list">
          {results.map((c) => (
            <li key={c.label}>
              <button className="palette-item" onClick={() => run(c)}>
                {c.label}
              </button>
            </li>
          ))}
          {results.length === 0 && <li className="palette-empty">No matching commands</li>}
        </ul>
      </div>
    </div>
  );
}
