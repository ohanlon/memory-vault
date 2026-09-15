import { useState } from "react";
import type { StackEntry } from "@shared/types";

interface Props {
  stacks: StackEntry[];
  /** Preselects these stack names on open — used both for "New Cairn…" from a stack's own context menu and for managing an existing Cairn's membership. */
  initialSelected?: string[];
  /** When set, this is an existing Cairn's "manage members" flow rather than creating a new one — hides the name field and changes the copy/labels accordingly. */
  editingCairnName?: string;
  onSubmit: (name: string, memberStackNames: string[]) => void;
  onCancel: () => void;
}

export function CombineStacksModal({ stacks, initialSelected, editingCairnName, onSubmit, onCancel }: Props) {
  const [name, setName] = useState(editingCairnName ?? "");
  const [selected, setSelected] = useState<Set<string>>(new Set(initialSelected ?? []));

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
        <h3>{editingCairnName ? `Manage stacks in "${editingCairnName}"` : "Combine stacks into a Cairn"}</h3>
        {!editingCairnName && (
          <input
            autoFocus
            placeholder="Cairn name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") onCancel();
            }}
          />
        )}
        <p className="modal-message">
          {editingCairnName
            ? "Add or remove stacks — a Cairn needs at least two."
            : "Pick at least two stacks to merge into one linked view."}
        </p>
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
            {editingCairnName ? "Save" : "Combine"}
          </button>
        </div>
      </form>
    </div>
  );
}
