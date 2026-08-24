import { useEffect, useRef, useState } from "react";
import type { Note, PropertyDef, PropertyType } from "@shared/types";
import { validatePropertyValue } from "@shared/validateProperty";
import { PropertyValueInput } from "./PropertyValueInput";

interface Props {
  note: Note | null;
  schema: PropertyDef[];
  onSaveProperties: (absPath: string, properties: Record<string, unknown>) => void;
  onOpenSchemaManager: () => void;
}

interface CustomRow {
  key: string;
  name: string;
  type: PropertyType;
  value: unknown;
}

const SAVE_DEBOUNCE_MS = 500;
const PROPERTY_TYPES: PropertyType[] = ["text", "list", "number", "checkbox", "date", "datetime"];

export function PropertiesPanel({ note, schema, onSaveProperties, onOpenSchemaManager }: Props) {
  const [boundedValues, setBoundedValues] = useState<Record<string, unknown>>({});
  const [customRows, setCustomRows] = useState<CustomRow[]>([]);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const nextRowId = useRef(0);

  useEffect(() => {
    let cancelled = false;
    if (!note) {
      setBoundedValues({});
      setCustomRows([]);
      return;
    }
    window.memoryVault.readNoteProperties(note.path).then((properties) => {
      if (cancelled) return;
      const schemaByLower = new Map(schema.map((d) => [d.name.toLowerCase(), d.name]));
      const bounded: Record<string, unknown> = {};
      const custom: CustomRow[] = [];
      for (const [key, value] of Object.entries(properties)) {
        const canonical = schemaByLower.get(key.toLowerCase());
        if (canonical) {
          bounded[canonical] = value;
        } else {
          custom.push({ key: String(nextRowId.current++), name: key, type: inferType(value), value });
        }
      }
      setBoundedValues(bounded);
      setCustomRows(custom);
    });
    return () => {
      cancelled = true;
    };
  }, [note?.path, schema]);

  function scheduleSave(nextBounded: Record<string, unknown>, nextCustom: CustomRow[]) {
    if (!note) return;
    const absPath = note.path;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      const merged: Record<string, unknown> = { ...nextBounded };
      for (const row of nextCustom) {
        const name = row.name.trim();
        if (name) merged[name] = row.value;
      }
      onSaveProperties(absPath, merged);
    }, SAVE_DEBOUNCE_MS);
  }

  function updateBounded(name: string, value: unknown) {
    setBoundedValues((prev) => {
      const next = { ...prev, [name]: value };
      scheduleSave(next, customRows);
      return next;
    });
  }

  function updateCustomRow(key: string, patch: Partial<CustomRow>) {
    setCustomRows((prev) => {
      const next = prev.map((r) => (r.key === key ? { ...r, ...patch } : r));
      scheduleSave(boundedValues, next);
      return next;
    });
  }

  function addCustomRow() {
    setCustomRows((prev) => [...prev, { key: String(nextRowId.current++), name: "", type: "text", value: "" }]);
  }

  function removeCustomRow(key: string) {
    setCustomRows((prev) => {
      const next = prev.filter((r) => r.key !== key);
      scheduleSave(boundedValues, next);
      return next;
    });
  }

  return (
    <>
      <div className="properties-section-header">
        <button type="button" className="manage-properties-btn" onClick={onOpenSchemaManager}>
          Manage properties
        </button>
      </div>

      {!note ? (
        <p className="backlinks-empty">Select a note to see its properties</p>
      ) : (
        <>
          <div className="properties-section">
            {schema.length === 0 && <p className="backlinks-empty">No bounded properties defined</p>}
            {schema.map((def) => {
              const value = boundedValues[def.name];
              const error = validatePropertyValue(def, value);
              return (
                <div className="property-row" key={def.name}>
                  <label>{def.name}</label>
                  <PropertyValueInput
                    type={def.type}
                    value={value}
                    rules={def.rules}
                    onChange={(v) => updateBounded(def.name, v)}
                  />
                  {error && <span className="property-error">{error}</span>}
                </div>
              );
            })}
          </div>

          <div className="properties-section">
            <h4>Custom</h4>
            {customRows.map((row) => (
              <div className="property-row property-row-custom" key={row.key}>
                <div className="property-row-custom-header">
                  <input
                    type="text"
                    className="property-name-input"
                    placeholder="Name"
                    value={row.name}
                    onChange={(e) => updateCustomRow(row.key, { name: e.target.value })}
                  />
                  <select
                    value={row.type}
                    onChange={(e) => {
                      const type = e.target.value as PropertyType;
                      updateCustomRow(row.key, { type, value: defaultValueFor(type) });
                    }}
                  >
                    {PROPERTY_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="property-remove-btn"
                    title="Remove property"
                    onClick={() => removeCustomRow(row.key)}
                  >
                    ×
                  </button>
                </div>
                <PropertyValueInput type={row.type} value={row.value} onChange={(v) => updateCustomRow(row.key, { value: v })} />
              </div>
            ))}
            <button type="button" className="add-property-btn" onClick={addCustomRow}>
              + Add property
            </button>
          </div>
        </>
      )}
    </>
  );
}

function inferType(value: unknown): PropertyType {
  if (Array.isArray(value)) return "list";
  if (typeof value === "number") return "number";
  if (typeof value === "boolean") return "checkbox";
  return "text";
}

function defaultValueFor(type: PropertyType): unknown {
  switch (type) {
    case "list":
      return [];
    case "number":
      return undefined;
    case "checkbox":
      return false;
    default:
      return "";
  }
}
