import { useEffect, useMemo, useState } from "react";
import type {
  AppSettings,
  EditorFontFamily,
  PluginManifest,
  PluginPermissionsFile,
  TabFolderDisplay,
  ThemeSetting,
} from "@shared/types";
import { EDITOR_FONT_OPTIONS, MAX_EDITOR_FONT_SIZE, MIN_EDITOR_FONT_SIZE } from "@shared/editorFonts";
import { CODE_LANGUAGES } from "@shared/codeLanguages";

interface Props {
  settings: AppSettings;
  onChange: (settings: AppSettings) => void;
}

const TAB_FOLDER_DISPLAY_OPTIONS: { value: TabFolderDisplay; label: string }[] = [
  { value: "never", label: "Never show" },
  { value: "hover", label: "Show on mouseover" },
  { value: "always", label: "Always show" },
];

const THEME_OPTIONS: { value: ThemeSetting; label: string }[] = [
  { value: "dark", label: "Dark" },
  { value: "light", label: "Light" },
  { value: "system", label: "System" },
];

function PluginsSection() {
  const [plugins, setPlugins] = useState<PluginManifest[]>([]);
  const [permissions, setPermissions] = useState<PluginPermissionsFile>({});

  const reload = () => {
    window.memoryStack.listPlugins().then(setPlugins);
    window.memoryStack.getPluginPermissions().then(setPermissions);
  };

  useEffect(reload, []);

  const revoke = async (pluginId: string, permission: PluginManifest["permissions"][number]) => {
    await window.memoryStack.revokePluginPermission(pluginId, permission);
    reload();
  };

  return (
    <section className="settings-section">
      <h2>Plugins</h2>
      {plugins.length === 0 ? (
        <p className="settings-empty">No plugins found in this stack's .cairn/plugins folder.</p>
      ) : (
        <ul className="settings-plugin-list">
          {plugins.map((plugin) => {
            const granted = permissions[plugin.id]?.granted ?? [];
            return (
              <li key={plugin.id} className="settings-plugin-item">
                <div className="settings-plugin-name">
                  {plugin.name} <span className="settings-plugin-version">v{plugin.version}</span>
                </div>
                {plugin.permissions.length === 0 ? (
                  <p className="settings-plugin-permissions">No gated permissions declared.</p>
                ) : (
                  <ul className="settings-plugin-permissions">
                    {plugin.permissions.map((permission) => (
                      <li key={permission}>
                        {permission}: {granted.includes(permission) ? "Allowed" : "Not granted"}
                        {granted.includes(permission) && (
                          <button type="button" onClick={() => revoke(plugin.id, permission)}>
                            Revoke
                          </button>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function CodeLanguagesSection({ settings, onChange }: Props) {
  const enabled = useMemo(() => new Set(settings.enabledCodeLanguages), [settings.enabledCodeLanguages]);

  // Selected languages first (alphabetical), then unselected (alphabetical).
  const sorted = useMemo(() => {
    return [...CODE_LANGUAGES].sort((a, b) => {
      const aSelected = enabled.has(a.id);
      const bSelected = enabled.has(b.id);
      if (aSelected !== bSelected) return aSelected ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
  }, [enabled]);

  function toggle(id: string) {
    const next = enabled.has(id)
      ? settings.enabledCodeLanguages.filter((x) => x !== id)
      : [...settings.enabledCodeLanguages, id];
    onChange({ ...settings, enabledCodeLanguages: next });
  }

  return (
    <section className="settings-section">
      <h2>Code</h2>
      <p className="settings-hint">Languages available for code-block syntax highlighting.</p>
      <ul className="settings-language-list">
        {sorted.map((lang) => (
          <li key={lang.id}>
            <label className="settings-language-item">
              <input type="checkbox" checked={enabled.has(lang.id)} onChange={() => toggle(lang.id)} />
              {lang.name}
            </label>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function SettingsView({ settings, onChange }: Props) {
  return (
    <div className="settings-view">
      <h1>Settings</h1>

      <section className="settings-section">
        <h2>Appearance</h2>
        <div className="settings-row">
          <label htmlFor="setting-theme">Theme</label>
          <select
            id="setting-theme"
            value={settings.theme}
            onChange={(e) => onChange({ ...settings, theme: e.target.value as ThemeSetting })}
          >
            {THEME_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </section>

      <section className="settings-section">
        <h2>Editor</h2>
        <div className="settings-row">
          <label htmlFor="setting-tab-folder-display">Child folders in tab headers</label>
          <select
            id="setting-tab-folder-display"
            value={settings.tabFolderDisplay}
            onChange={(e) => onChange({ ...settings, tabFolderDisplay: e.target.value as TabFolderDisplay })}
          >
            {TAB_FOLDER_DISPLAY_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
        <div className="settings-row">
          <label htmlFor="setting-hide-properties">Hide note properties by default</label>
          <input
            id="setting-hide-properties"
            type="checkbox"
            checked={settings.hidePropertiesByDefault}
            onChange={(e) => onChange({ ...settings, hidePropertiesByDefault: e.target.checked })}
          />
        </div>
        <div className="settings-row">
          <label htmlFor="setting-show-line-numbers">Show line numbers</label>
          <input
            id="setting-show-line-numbers"
            type="checkbox"
            checked={settings.showLineNumbers}
            onChange={(e) => onChange({ ...settings, showLineNumbers: e.target.checked })}
          />
        </div>
        <div className="settings-row">
          <label htmlFor="setting-editor-font-family">Font</label>
          <select
            id="setting-editor-font-family"
            value={settings.editorFontFamily}
            onChange={(e) => onChange({ ...settings, editorFontFamily: e.target.value as EditorFontFamily })}
          >
            {EDITOR_FONT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
        <div className="settings-row">
          <label htmlFor="setting-editor-font-size">Font size</label>
          <input
            id="setting-editor-font-size"
            type="number"
            min={MIN_EDITOR_FONT_SIZE}
            max={MAX_EDITOR_FONT_SIZE}
            value={settings.editorFontSize}
            onChange={(e) => onChange({ ...settings, editorFontSize: Number(e.target.value) })}
          />
        </div>
      </section>

      <section className="settings-section">
        <h2>Notes</h2>
        <div className="settings-row">
          <label htmlFor="setting-daily-notes-folder">Daily notes folder</label>
          <input
            id="setting-daily-notes-folder"
            type="text"
            value={settings.dailyNotesFolder}
            onChange={(e) => onChange({ ...settings, dailyNotesFolder: e.target.value })}
          />
        </div>
        <div className="settings-row">
          <label htmlFor="setting-add-heading">Add heading to new notes</label>
          <input
            id="setting-add-heading"
            type="checkbox"
            checked={settings.addHeadingToNewNotes}
            onChange={(e) => onChange({ ...settings, addHeadingToNewNotes: e.target.checked })}
          />
        </div>
      </section>

      <CodeLanguagesSection settings={settings} onChange={onChange} />

      <PluginsSection />
    </div>
  );
}
