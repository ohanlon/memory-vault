import { useState } from "react";
import type { StackEntry } from "@shared/types";
import { basename } from "@shared/displayName";
import { PromptModal } from "./PromptModal";

interface Props {
  stacks: StackEntry[];
  /** Preselects these stack names on open — used both for "New merged view…" from a stack's own context menu and for managing an existing merged view's membership. */
  initialSelected?: string[];
  /** When set, this is an existing merged view's "manage members" flow rather than creating a new one — hides the name field and changes the copy/labels accordingly. */
  editingMergedViewName?: string;
  /** Persists a folder as a new stack (throws on empty/duplicate name) without opening it, so a stack picked up mid-flow here joins the checklist below instead of switching the active session. */
  onAddStack: (name: string, root: string) => Promise<void>;
  onSubmit: (name: string, memberStackNames: string[]) => void;
  onCancel: () => void;
}

export function CombineStacksModal({
  stacks,
  initialSelected,
  editingMergedViewName,
  onAddStack,
  onSubmit,
  onCancel,
}: Props) {
  const [name, setName] = useState(editingMergedViewName ?? "");
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
    await onAddStack(newStackName, pickedRoot); // rejection surfaces inline in the dialog; it stays open to retry
    setSelected((prev) => new Set(prev).add(newStackName.trim()));
    setPickedRoot(null);
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
          <h3>{editingMergedViewName ? `Manage stacks in "${editingMergedViewName}"` : "Combine stacks into a merged view"}</h3>
          {!editingMergedViewName && (
            <input
              autoFocus
              placeholder="Merged view name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") onCancel();
              }}
            />
          )}
          <p className="modal-message">
            {editingMergedViewName
              ? "Add or remove stacks — a merged view needs at least two."
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
              {editingMergedViewName ? "Save" : "Combine"}
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
