import { useState } from "react";
import type { PropertyDef, PropertyRules, PropertyType } from "@shared/types";

interface Props {
  schema: PropertyDef[];
  onSave: (updated: PropertyDef[]) => void;
  onClose: () => void;
}

interface EditingState {
  index: number | null; // null = adding a new definition
  name: string;
  type: PropertyType;
  rules: PropertyRules;
}

const PROPERTY_TYPES: PropertyType[] = ["text", "list", "number", "checkbox", "date", "datetime"];

export function PropertySchemaModal({ schema, onSave, onClose }: Props) {
  const [draft, setDraft] = useState<PropertyDef[]>(schema);
  const [editing, setEditing] = useState<EditingState | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  function startAdd() {
    setEditing({ index: null, name: "", type: "text", rules: {} });
    setFormError(null);
  }

  function startEdit(index: number) {
    const def = draft[index];
    setEditing({ index, name: def.name, type: def.type, rules: def.rules ?? {} });
    setFormError(null);
  }

  function removeDef(index: number) {
    const def = draft[index];
    if (!window.confirm(`Delete the "${def.name}" property definition? Existing values on notes are kept as custom properties.`)) {
      return;
    }
    setDraft((prev) => prev.filter((_, i) => i !== index));
  }

  function saveForm() {
    if (!editing) return;
    const trimmed = editing.name.trim();
    if (!trimmed) {
      setFormError("Name cannot be empty");
      return;
    }
    const lower = trimmed.toLowerCase();
    const duplicate = draft.some((d, i) => i !== editing.index && d.name.toLowerCase() === lower);
    if (duplicate) {
      setFormError(`A property named "${trimmed}" already exists`);
      return;
    }
    const rules = cleanRules(editing.type, editing.rules);
    const def: PropertyDef = rules ? { name: trimmed, type: editing.type, rules } : { name: trimmed, type: editing.type };
    setDraft((prev) => (editing.index === null ? [...prev, def] : prev.map((d, i) => (i === editing.index ? def : d))));
    setEditing(null);
    setFormError(null);
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box modal-box-wide" onClick={(e) => e.stopPropagation()}>
        <h3>Manage properties</h3>

        <ul className="property-schema-list">
          {draft.map((def, i) => (
            <li className="property-schema-row" key={`${def.name}-${i}`}>
              <div>
                <span>{def.name}</span>{" "}
                <span className="property-type-badge">{def.type}</span>
              </div>
              <div>
                <button type="button" onClick={() => startEdit(i)}>
                  Edit
                </button>
                <button type="button" onClick={() => removeDef(i)}>
                  Delete
                </button>
              </div>
            </li>
          ))}
          {draft.length === 0 && <p className="backlinks-empty">No bounded properties defined yet</p>}
        </ul>

        {editing ? (
          <div className="property-schema-form">
            <input
              type="text"
              placeholder="Property name"
              value={editing.name}
              onChange={(e) => setEditing({ ...editing, name: e.target.value })}
            />
            <select
              value={editing.type}
              onChange={(e) => setEditing({ ...editing, type: e.target.value as PropertyType, rules: {} })}
            >
              {PROPERTY_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>

            {editing.type === "text" && (
              <>
                <label>
                  Max length (optional)
                  <input
                    type="number"
                    value={editing.rules.maxLength ?? ""}
                    onChange={(e) =>
                      setEditing({
                        ...editing,
                        rules: { ...editing.rules, maxLength: e.target.value === "" ? undefined : Number(e.target.value) },
                      })
                    }
                  />
                </label>
                <label>
                  Pattern (optional regex)
                  <input
                    type="text"
                    value={editing.rules.pattern ?? ""}
                    onChange={(e) => setEditing({ ...editing, rules: { ...editing.rules, pattern: e.target.value || undefined } })}
                  />
                </label>
              </>
            )}

            {editing.type === "number" && (
              <>
                <label>
                  Min (optional)
                  <input
                    type="number"
                    value={editing.rules.min ?? ""}
                    onChange={(e) =>
                      setEditing({ ...editing, rules: { ...editing.rules, min: e.target.value === "" ? undefined : Number(e.target.value) } })
                    }
                  />
                </label>
                <label>
                  Max (optional)
                  <input
                    type="number"
                    value={editing.rules.max ?? ""}
                    onChange={(e) =>
                      setEditing({ ...editing, rules: { ...editing.rules, max: e.target.value === "" ? undefined : Number(e.target.value) } })
                    }
                  />
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={editing.rules.integerOnly === true}
                    onChange={(e) => setEditing({ ...editing, rules: { ...editing.rules, integerOnly: e.target.checked } })}
                  />
                  Whole numbers only
                </label>
              </>
            )}

            {formError && <span className="property-error">{formError}</span>}

            <div className="modal-actions">
              <button type="button" onClick={() => setEditing(null)}>
                Cancel
              </button>
              <button type="button" onClick={saveForm}>
                {editing.index === null ? "Add" : "Update"}
              </button>
            </div>
          </div>
        ) : (
          <button type="button" onClick={startAdd}>
            + Add property definition
          </button>
        )}

        <div className="modal-actions">
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button type="button" onClick={() => onSave(draft)}>
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

function cleanRules(type: PropertyType, rules: PropertyRules): PropertyRules | undefined {
  if (type === "text") {
    const cleaned: PropertyRules = {};
    if (typeof rules.maxLength === "number") cleaned.maxLength = rules.maxLength;
    if (rules.pattern) cleaned.pattern = rules.pattern;
    return Object.keys(cleaned).length > 0 ? cleaned : undefined;
  }
  if (type === "number") {
    const cleaned: PropertyRules = {};
    if (typeof rules.min === "number") cleaned.min = rules.min;
    if (typeof rules.max === "number") cleaned.max = rules.max;
    if (rules.integerOnly) cleaned.integerOnly = true;
    return Object.keys(cleaned).length > 0 ? cleaned : undefined;
  }
  return undefined;
}
