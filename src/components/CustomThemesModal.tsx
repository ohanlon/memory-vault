import { useRef, useState } from "react";
import type { AppSettings, CustomTheme } from "@shared/types";
import { THEME_COLOR_VARS, defaultColorsFor, isValidCssColor } from "@shared/themeColors";
import { normalizeCustomTheme } from "@shared/appSettings";

interface Props {
  settings: AppSettings;
  onChange: (settings: AppSettings) => void;
  onClose: () => void;
}

interface EditingState {
  index: number | null; // null = adding a new theme
  name: string;
  baseMode: "dark" | "light";
  colors: Record<string, string>;
}

const GROUPS = [...new Set(THEME_COLOR_VARS.map((v) => v.group))];

function slugify(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return slug || "theme";
}

function downloadTheme(theme: CustomTheme) {
  const payload = { name: theme.name, baseMode: theme.baseMode, colors: theme.colors };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${slugify(theme.name)}.cairn-theme.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export function CustomThemesModal({ settings, onChange, onClose }: Props) {
  const [draft, setDraft] = useState<CustomTheme[]>(settings.customThemes);
  const [editing, setEditing] = useState<EditingState | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const importInputRef = useRef<HTMLInputElement | null>(null);
  // The theme active when this modal was opened — used to warn if deleting
  // it will knock the app back to Dark.
  const openedWithActiveId = useRef(settings.theme === "custom" ? settings.activeCustomThemeId : null);

  function startNew() {
    setEditing({ index: null, name: "New Theme", baseMode: "dark", colors: { ...defaultColorsFor("dark") } });
    setFormError(null);
  }

  function startEdit(index: number) {
    const theme = draft[index];
    setEditing({ index, name: theme.name, baseMode: theme.baseMode, colors: { ...theme.colors } });
    setFormError(null);
  }

  function duplicate(index: number) {
    const theme = draft[index];
    setEditing({ index: null, name: `${theme.name} copy`, baseMode: theme.baseMode, colors: { ...theme.colors } });
    setFormError(null);
  }

  function removeTheme(index: number) {
    const theme = draft[index];
    const isActive = theme.id === openedWithActiveId.current;
    const message = isActive
      ? `Delete "${theme.name}"? This is your current theme — deleting it will switch you to Dark.`
      : `Delete "${theme.name}"? This can't be undone.`;
    if (!window.confirm(message)) return;
    setDraft((prev) => prev.filter((_, i) => i !== index));
  }

  function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    file
      .text()
      .then((text) => {
        const parsed = normalizeCustomTheme({ ...JSON.parse(text), id: undefined });
        if (!parsed) {
          window.alert("That file doesn't look like a valid theme.");
          return;
        }
        setDraft((prev) => [...prev, parsed]);
      })
      .catch(() => window.alert("Couldn't read that file as a theme."));
  }

  function setBaseMode(baseMode: "dark" | "light") {
    if (!editing) return;
    setEditing({ ...editing, baseMode, colors: { ...defaultColorsFor(baseMode) } });
  }

  function setColor(name: string, value: string) {
    if (!editing) return;
    setEditing({ ...editing, colors: { ...editing.colors, [name]: value } });
  }

  function saveForm() {
    if (!editing) return;
    const trimmed = editing.name.trim();
    if (!trimmed) {
      setFormError("Name cannot be empty");
      return;
    }
    const invalidField = THEME_COLOR_VARS.find((v) => !isValidCssColor(editing.colors[v.name] ?? ""));
    if (invalidField) {
      setFormError(`"${invalidField.label}" isn't a valid CSS color`);
      return;
    }
    const theme: CustomTheme = {
      id: editing.index === null ? crypto.randomUUID() : draft[editing.index].id,
      name: trimmed,
      baseMode: editing.baseMode,
      colors: editing.colors,
    };
    setDraft((prev) => (editing.index === null ? [...prev, theme] : prev.map((t, i) => (i === editing.index ? theme : t))));
    setEditing(null);
    setFormError(null);
  }

  function saveAll() {
    const stillActive = settings.theme === "custom" && draft.some((t) => t.id === settings.activeCustomThemeId);
    onChange({
      ...settings,
      customThemes: draft,
      theme: settings.theme === "custom" && !stillActive ? "dark" : settings.theme,
      activeCustomThemeId: settings.theme === "custom" && !stillActive ? null : settings.activeCustomThemeId,
    });
    onClose();
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box modal-box-wide" onClick={(e) => e.stopPropagation()}>
        <h3>Manage custom themes</h3>

        {!editing && (
          <>
            <div className="modal-scroll-body">
              <ul className="property-schema-list">
                {draft.map((theme, i) => (
                  <li className="property-schema-row" key={theme.id}>
                    <div>
                      <span>{theme.name}</span> <span className="property-type-badge">{theme.baseMode}</span>
                    </div>
                    <div>
                      <button type="button" onClick={() => startEdit(i)}>
                        Edit
                      </button>
                      <button type="button" onClick={() => duplicate(i)}>
                        Duplicate
                      </button>
                      <button type="button" onClick={() => downloadTheme(theme)}>
                        Export
                      </button>
                      <button type="button" onClick={() => removeTheme(i)}>
                        Delete
                      </button>
                    </div>
                  </li>
                ))}
                {draft.length === 0 && <p className="backlinks-empty">No custom themes yet</p>}
              </ul>
            </div>

            <div className="modal-actions">
              <button type="button" onClick={startNew}>
                + New theme
              </button>
              <button type="button" onClick={() => importInputRef.current?.click()}>
                Import
              </button>
              <input
                ref={importInputRef}
                type="file"
                accept=".json"
                style={{ display: "none" }}
                onChange={handleImportFile}
              />
            </div>
          </>
        )}

        {editing && (
          <div className="property-schema-form">
            <div className="modal-scroll-body">
              <input
                type="text"
                placeholder="Theme name"
                value={editing.name}
                onChange={(e) => setEditing({ ...editing, name: e.target.value })}
              />
              <div className="settings-row">
                <label htmlFor="theme-base-mode">Base</label>
                <select
                  id="theme-base-mode"
                  value={editing.baseMode}
                  onChange={(e) => setBaseMode(e.target.value as "dark" | "light")}
                >
                  <option value="dark">Dark</option>
                  <option value="light">Light</option>
                </select>
              </div>

              {GROUPS.map((group) => (
                <fieldset key={group} className="theme-color-group">
                  <legend>{group}</legend>
                  {THEME_COLOR_VARS.filter((v) => v.group === group).map((v) => {
                    const value = editing.colors[v.name] ?? "";
                    const valid = isValidCssColor(value);
                    return (
                      <div className="settings-row theme-color-row" key={v.name}>
                        <label htmlFor={`theme-color-${v.name}`}>{v.label}</label>
                        <div className="theme-color-field">
                          <span
                            className="theme-color-swatch"
                            style={{ background: valid ? value : "transparent" }}
                            aria-hidden="true"
                          />
                          <input
                            id={`theme-color-${v.name}`}
                            type="text"
                            value={value}
                            aria-invalid={!valid}
                            onChange={(e) => setColor(v.name, e.target.value)}
                          />
                        </div>
                      </div>
                    );
                  })}
                </fieldset>
              ))}
            </div>

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
        )}

        {!editing && (
          <div className="modal-actions">
            <button type="button" onClick={onClose}>
              Cancel
            </button>
            <button type="button" onClick={saveAll}>
              Save
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
