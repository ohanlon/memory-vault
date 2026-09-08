import { useState } from "react";
import type { StackEntry } from "@shared/types";

interface Props {
  stacks: StackEntry[];
  onSubmit: (name: string, memberStackNames: string[]) => void;
  onCancel: () => void;
}

export function CombineStacksModal({ stacks, onSubmit, onCancel }: Props) {
  const [name, setName] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  function toggle(stackName: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(stackName)) next.delete(stackName);
      else next.add(stackName);
      return next;
    });
  }

  const canSubmit = name.trim() !== "" && selected.size >= 2;

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <form
        className="modal-box"
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          if (canSubmit) onSubmit(name, Array.from(selected));
        }}
      >
        <h3>Combine stacks into a Cairn</h3>
        <input
          autoFocus
          placeholder="Cairn name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") onCancel();
          }}
        />
        <p className="modal-message">Pick at least two stacks to merge into one linked view.</p>
        <ul className="combine-stacks-list">
          {stacks.map((stack) => (
            <li key={stack.name.toLowerCase()}>
              <label className="modal-checkbox">
                <input
                  type="checkbox"
                  checked={selected.has(stack.name)}
                  onChange={() => toggle(stack.name)}
                />
                {stack.name}
              </label>
            </li>
          ))}
        </ul>
        <div className="modal-actions">
          <button type="button" onClick={onCancel}>
            Cancel
          </button>
          <button type="submit" disabled={!canSubmit}>
            Combine
          </button>
        </div>
      </form>
    </div>
  );
}
