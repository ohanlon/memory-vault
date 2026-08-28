import type { AppSettings, TabFolderDisplay, ThemeSetting } from "@shared/types";

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
      </section>
    </div>
  );
}
