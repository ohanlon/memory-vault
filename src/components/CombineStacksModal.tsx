import { useState } from "react";
import type { StackEntry } from "@shared/types";
import { basename } from "@shared/displayName";
import { PromptModal } from "./PromptModal";

interface Props {
  stacks: StackEntry[];
  /** Preselects these stack names on open — used both for "New Cairn…" from a stack's own context menu and for managing an existing Cairn's membership. */
  initialSelected?: string[];
  /** When set, this is an existing Cairn's "manage members" flow rather than creating a new one — hides the name field and changes the copy/labels accordingly. */
  editingCairnName?: string;
  /** Persists a folder as a new stack (throws on empty/duplicate name) without opening it, so a stack picked up mid-flow here joins the checklist below instead of switching the active session. */
  onAddStack: (name: string, root: string) => Promise<void>;
  onSubmit: (name: string, memberStackNames: string[]) => void;
  onCancel: () => void;
}

export function CombineStacksModal({
  stacks,
  initialSelected,
  editingCairnName,
  onAddStack,
  onSubmit,
  onCancel,
}: Props) {
  const [name, setName] = useState(editingCairnName ?? "");
  const [selected, setSelected] = useState<Set<string>>(new Set(initialSelected ?? []));
  const [pickedRoot, setPickedRoot] = useState<string | null>(null);

  function toggle(stackName: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(stackName)) next.delete(stackName);
      else next.add(stackName);
      return next;
    });
  }

  async function handleAddFolder() {
    const root = await window.memoryStack.pickStack();
    if (root) setPickedRoot(root);
  }

  async function handleNameNewStack(newStackName: string) {
    if (!pickedRoot) return;
    try {
      await onAddStack(newStackName, pickedRoot);
      setSelected((prev) => new Set(prev).add(newStackName.trim()));
      setPickedRoot(null);
    } catch (err) {
      window.alert(err instanceof Error ? err.message : String(err));
      // keep the naming prompt open so the user can retry with a different name
    }
  }

  const canSubmit = name.trim() !== "" && selected.size >= 2;

  return (
    <>
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
          <button type="button" className="combine-stacks-add-folder" onClick={handleAddFolder}>
            + Add folder as stack…
          </button>
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
      {pickedRoot && (
        <PromptModal
          title="Name this stack"
          initialValue={basename(pickedRoot)}
          confirmLabel="Add"
          onSubmit={handleNameNewStack}
          onCancel={() => setPickedRoot(null)}
        />
      )}
    </>
  );
}
