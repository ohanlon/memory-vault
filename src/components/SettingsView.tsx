import { useEffect, useState } from "react";
import type { AppSettings, PluginManifest, PluginPermissionsFile, TabFolderDisplay, ThemeSetting } from "@shared/types";

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

      <PluginsSection />
    </div>
  );
}
