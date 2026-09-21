import { app, BrowserWindow, dialog, ipcMain, Menu, nativeTheme, shell } from "electron";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { FSWatcher } from "chokidar";
import { loadNotesFolder, reconcileNotesFolderCache, readNote, uniqueNotePath, watchNotesFolder } from "./notesFolder";
import { readNotesFolderCache, writeNotesFolderCache } from "./notesFolderCache";
import { runReplaceAll, runSearch } from "./search";
import { convertToTemplate, listAllFileTemplates } from "./templates";
import { expandBuiltInDateVars, renderTemplate } from "../shared/templateRender";
import {
  addNotesFolder,
  readNotesFoldersFile,
  removeNotesFolder,
  renameNotesFolder,
  writeNotesFoldersFile,
} from "./notesFolderRegistry";
import {
  allowFolder,
  denyFolder,
  readCliAccessFile,
  renameFolderAccess,
  writeCliAccessFile,
} from "./cliAccess";
import { titleFromPath } from "../shared/parseNote";
import { STARTER_NOTES } from "../shared/starterContent";
import { findNoteTemplate } from "../shared/noteTemplates";
import { readNoteBody, readNoteProperties, saveNoteBody, saveNoteProperties } from "./noteProperties";
import { readPropertySchema, writePropertySchema } from "./propertiesSchema";
import { readLayoutPrefsFile, writeLayoutPrefsFile } from "./layoutPrefs";
import { readWorkspaceState, writeWorkspaceState } from "./workspaceState";
import { DEFAULT_WORKSPACE_STATE } from "../shared/workspaceState";
import { readAppSettingsFile, writeAppSettingsFile } from "./appSettings";
import { openOrCreateDailyNote } from "./dailyNote";
import { isAllowedExternalUrl, isAllowedForPlugin } from "./domainPolicy";
import { PLUGIN_SCHEME, handlePluginProtocol, registerPluginScheme } from "./pluginProtocol";
import { discoverPlugins } from "./pluginRegistry";
import {
  grantPermission,
  hasPermission,
  readPluginPermissionsFile,
  revokePermission,
  writePluginPermissionsFile,
} from "./pluginPermissions";
import { defaultColorsFor } from "../shared/themeColors";
import type {
  AppSettings,
  LayoutPrefs,
  Note,
  PluginPermission,
  PropertyDef,
  SearchOptions,
  WorkspaceState,
} from "../shared/types";

function resolveTheme(theme: AppSettings["theme"]): "dark" | "light" {
  if (theme === "system") return nativeTheme.shouldUseDarkColors ? "dark" : "light";
  // "custom" is resolved separately (see initialTitleBarColors) since it
  // needs the matching CustomTheme's own colors, not a dark/light palette.
  if (theme === "custom") return "dark";
  return theme;
}

// The renderer computes/sends title-bar colors for every post-load update
// (see the "window:setTitleBarOverlay" IPC handler below) — this is only
// for the one moment before the renderer/DOM exists at all: the window's
// initial construction in createWindow().
function initialTitleBarColors(settings: AppSettings): { color: string; symbolColor: string } {
  if (settings.theme === "custom") {
    const custom = settings.customThemes.find((t) => t.id === settings.activeCustomThemeId);
    if (custom) return { color: custom.colors["bg-base"], symbolColor: custom.colors["text-primary"] };
  }
  const palette = defaultColorsFor(resolveTheme(settings.theme));
  return { color: palette["bg-base"], symbolColor: palette["text-primary"] };
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));

process.env.APP_ROOT = path.join(__dirname, "..");
export const VITE_DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL;
export const RENDERER_DIST = path.join(process.env.APP_ROOT, "dist");

let win: BrowserWindow | null = null;

interface NotesFolderSession {
  notes: Note[];
  watcher: FSWatcher;
}
let session: NotesFolderSession | null = null;
// The currently-open notes folder's root, or null when nothing is open.
let activeRoot: string | null = null;

let searchCounter = 0;
const activeSearchIds = new Set<string>();
const cancelledSearchIds = new Set<string>();

function sessionNotes(): Note[] {
  return session ? session.notes : [];
}

// Throws unless absPath lives inside the currently-open notes folder — used
// by every handler that touches a note by absolute path.
function assertOwnsPath(absPath: string): void {
  if (!activeRoot) throw new Error("No notes folder open");
  const rel = path.relative(activeRoot, absPath);
  if (rel === "" || rel.startsWith("..") || path.isAbsolute(rel)) {
    throw new Error("The open notes folder does not contain this path");
  }
}

function requireActiveRoot(): string {
  if (!activeRoot) throw new Error("No notes folder open");
  return activeRoot;
}

function notesFoldersFilePath(): string {
  return path.join(app.getPath("userData"), "notesFolders.json");
}

// Which notes folders the CLI/MCP server may touch - see cliAccess.ts.
function cliAccessFilePath(): string {
  return path.join(app.getPath("userData"), "cli-access.json");
}

function layoutPrefsFilePath(): string {
  return path.join(app.getPath("userData"), "layout-prefs.json");
}

function appSettingsFilePath(): string {
  return path.join(app.getPath("userData"), "settings.json");
}

function pluginPermissionsFilePath(): string {
  return path.join(app.getPath("userData"), "plugin-permissions.json");
}

function pluginsDirPath(): string {
  return path.join(app.getPath("userData"), "plugins");
}

function createWindow() {
  Menu.setApplicationMenu(null);

  const titleBarColors = initialTitleBarColors(readAppSettingsFile(appSettingsFilePath()));

  const iconPath = VITE_DEV_SERVER_URL
    ? path.join(process.env.APP_ROOT!, "public", "icon.png")
    : path.join(RENDERER_DIST, "icon.png");

  win = new BrowserWindow({
    width: 1280,
    height: 800,
    icon: iconPath,
    // Hides the title bar (icon, title text, menu) but keeps the native
    // minimize/maximize/close buttons via the overlay.
    titleBarStyle: "hidden",
    titleBarOverlay: {
      ...titleBarColors,
      height: 32,
    },
    webPreferences: {
      preload: path.join(__dirname, "preload.mjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Plugin UI loads as sandboxed <iframe>s inside this same window/session
  // (see src/plugins/PluginViewFrame.tsx), so their outgoing requests share
  // this webContents — gate them here by identifying the initiating
  // cairn-plugin://<pluginId>/ frame and reusing the existing domain policy.
  win.webContents.session.webRequest.onBeforeRequest((details, callback) => {
    const frameUrl = details.frame?.url;
    // Only gate requests actually leaving the plugin's own origin (e.g. a
    // fetch() to a third-party API) — the plugin loading its own
    // document/assets via cairn-plugin:// is already scoped and served by
    // the protocol handler itself and must never require "network".
    const isOwnOriginRequest = details.url.startsWith(`${PLUGIN_SCHEME}://`);
    if (!frameUrl?.startsWith(`${PLUGIN_SCHEME}://`) || isOwnOriginRequest) {
      callback({});
      return;
    }
    const pluginId = new URL(frameUrl).hostname;
    const permissions = readPluginPermissionsFile(pluginPermissionsFilePath());
    callback({ cancel: !isAllowedForPlugin(details.url, pluginId, permissions) });
  });

  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL);
  } else {
    win.loadFile(path.join(RENDERER_DIST, "index.html"));
  }
}

function stopSession() {
  if (session) session.watcher.close();
  session = null;
  activeRoot = null;
}

function cancelAllSearches() {
  for (const id of activeSearchIds) cancelledSearchIds.add(id);
}

ipcMain.handle("shell:openExternal", async (_event, url: string) => {
  // Only the host app itself calls this channel now — plugin-originated
  // opens go through plugin:openExternal via the postMessage RPC bridge
  // instead (see src/plugins/PluginViewFrame.tsx), since a plugin's iframe
  // shares this window's webContents rather than having its own.
  if (!isAllowedExternalUrl(url, null, {})) return false;
  await shell.openExternal(url);
  return true;
});

ipcMain.handle("plugin:openExternal", async (_event, pluginId: string, url: string) => {
  const permissions = readPluginPermissionsFile(pluginPermissionsFilePath());
  if (!isAllowedExternalUrl(url, pluginId, permissions)) return false;
  await shell.openExternal(url);
  return true;
});

// Reveals a note or folder in the OS file manager — Explorer on Windows,
// Finder on macOS, the default file manager on Linux. shell.showItemInFolder
// is cross-platform by design, unlike shelling out to `explorer`/`open`.
ipcMain.handle("shell:showItemInFolder", (_event, absPath: string) => {
  assertOwnsPath(absPath);
  shell.showItemInFolder(absPath);
  return true;
});

ipcMain.handle("notesFolder:pick", async () => {
  if (!win) return null;
  const result = await dialog.showOpenDialog(win, {
    properties: ["openDirectory"],
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  return result.filePaths[0];
});

ipcMain.handle("notesFolders:list", async () => {
  return readNotesFoldersFile(notesFoldersFilePath());
});

ipcMain.handle("notesFolders:add", async (_event, name: string, root: string) => {
  const notesFolders = readNotesFoldersFile(notesFoldersFilePath());
  const updated = addNotesFolder(notesFolders, name, root); // throws on empty/duplicate name
  writeNotesFoldersFile(notesFoldersFilePath(), updated);
  return updated;
});

ipcMain.handle("notesFolders:remove", async (_event, name: string) => {
  const notesFolders = readNotesFoldersFile(notesFoldersFilePath());
  const updated = removeNotesFolder(notesFolders, name);
  writeNotesFoldersFile(notesFoldersFilePath(), updated);
  // Otherwise a later folder re-registered under the same name would
  // silently inherit whatever access this one had, without the grant
  // decision ever being re-made for it.
  writeCliAccessFile(cliAccessFilePath(), denyFolder(readCliAccessFile(cliAccessFilePath()), name));
  return updated;
});

ipcMain.handle("cliAccess:list", async () => {
  return readCliAccessFile(cliAccessFilePath()).allowed;
});

ipcMain.handle("cliAccess:set", async (_event, name: string, allowed: boolean) => {
  const access = readCliAccessFile(cliAccessFilePath());
  const updated = allowed ? allowFolder(access, name) : denyFolder(access, name);
  writeCliAccessFile(cliAccessFilePath(), updated);
  return updated.allowed;
});

ipcMain.handle("notesFolders:rename", async (_event, oldName: string, newName: string) => {
  const notesFolders = readNotesFoldersFile(notesFoldersFilePath());
  const updated = renameNotesFolder(notesFolders, oldName, newName); // throws on empty/duplicate name
  writeNotesFoldersFile(notesFoldersFilePath(), updated);
  writeCliAccessFile(cliAccessFilePath(), renameFolderAccess(readCliAccessFile(cliAccessFilePath()), oldName, newName));
  return updated;
});

// Loads (or serves from cache) a notes folder's notes and starts watching
// it. A cached vault loads instantly; only a vault that's never been opened
// before pays for a full synchronous walk, which then seeds the cache.
async function openSession(root: string): Promise<void> {
  const cached = readNotesFolderCache(root);
  const notes = cached ? cached.notes : await loadNotesFolder(root);
  if (!cached) writeNotesFolderCache(root, { notes });

  const watcher = watchNotesFolder(root, (change) => {
    win?.webContents.send("notesFolder:file-changed", change);
  });
  session = { notes, watcher };

  // Reconcile the cache against disk in the background — re-parses only
  // files whose mtime changed since the cache was written, and pushes the
  // reconciled result only if something actually differs (e.g. the vault
  // was edited outside the app while it was closed). The renderer treats
  // reconciliation as started the moment notesFolder:load resolves (see
  // openNotesFolder), so only the "done" transition needs to be pushed here.
  reconcileNotesFolderCache(root, notes)
    .then((result) => {
      if (!result || !session) return;
      session.notes = result.notes;
      win?.webContents.send("notesFolder:reconciled", { root, notes: sessionNotes() });
    })
    .finally(() => {
      if (!session) return;
      win?.webContents.send("notesFolder:reconcile-status", { root, reconciling: false });
    });
}

async function reloadSession(): Promise<Note[]> {
  const root = requireActiveRoot();
  if (!session) throw new Error("No notes folder open");
  const previous = new Map(session.notes.map((n) => [n.relativePath, n]));
  const notes = await loadNotesFolder(root, previous);
  session.notes = notes;
  writeNotesFolderCache(root, { notes });
  return notes;
}

ipcMain.handle("notesFolder:load", async (_event, root: string) => {
  stopSession();
  cancelAllSearches();
  activeRoot = root;
  await openSession(root);
  return { root, notes: sessionNotes() };
});

ipcMain.handle("notesFolder:reload", async () => {
  const notes = await reloadSession();
  return { notes };
});

ipcMain.handle("search:start", async (_event, options: SearchOptions) => {
  const root = requireActiveRoot();
  const searchId = `search-${++searchCounter}`;
  activeSearchIds.add(searchId);

  runSearch(
    root,
    options,
    (result) => win?.webContents.send("search:result", { searchId, result }),
    () => cancelledSearchIds.has(searchId)
  ).finally(() => {
    activeSearchIds.delete(searchId);
    cancelledSearchIds.delete(searchId);
    win?.webContents.send("search:done", { searchId });
  });

  return searchId;
});

ipcMain.handle("search:cancel", async (_event, searchId: string) => {
  cancelledSearchIds.add(searchId);
  return true;
});

ipcMain.handle("search:replaceAll", async (_event, options: SearchOptions, replaceText: string) => {
  const root = requireActiveRoot();
  return runReplaceAll(root, options, replaceText);
});

ipcMain.handle("plugin:list", async () => {
  return discoverPlugins(pluginsDirPath()).map((p) => p.manifest);
});

ipcMain.handle("notesFolder:readNote", async (_event, absPath: string) => {
  return readNote(requireActiveRoot(), absPath);
});

ipcMain.handle("notesFolder:readRaw", async (_event, absPath: string) => {
  assertOwnsPath(absPath);
  return fs.readFileSync(absPath, "utf-8");
});

// Returns the note's new mtime so the renderer can tell its own save apart
// from a subsequent external write to the same file (see EditorPane.tsx's
// conflict detection) - both go through the same file-watcher-triggered
// refresh, so without this the renderer can't distinguish the two.
ipcMain.handle("notesFolder:saveNote", async (_event, absPath: string, body: string) => {
  assertOwnsPath(absPath);
  saveNoteBody(absPath, body);
  return fs.statSync(absPath).mtimeMs;
});

ipcMain.handle("notesFolder:readNoteBody", async (_event, absPath: string) => {
  assertOwnsPath(absPath);
  return readNoteBody(absPath);
});

ipcMain.handle("notesFolder:readNoteProperties", async (_event, absPath: string) => {
  assertOwnsPath(absPath);
  return readNoteProperties(absPath);
});

ipcMain.handle(
  "notesFolder:saveNoteProperties",
  async (_event, absPath: string, properties: Record<string, unknown>) => {
    assertOwnsPath(absPath);
    saveNoteProperties(absPath, properties);
    return true;
  }
);

ipcMain.handle("notesFolder:readPropertySchema", async (_event, root: string) => {
  return readPropertySchema(root);
});

ipcMain.handle("notesFolder:savePropertySchema", async (_event, root: string, properties: PropertyDef[]) => {
  writePropertySchema(root, properties);
  return properties;
});

ipcMain.handle("notesFolder:readWorkspaceState", async () => {
  if (!activeRoot) return DEFAULT_WORKSPACE_STATE;
  return readWorkspaceState(activeRoot);
});

ipcMain.handle("notesFolder:saveWorkspaceState", async (_event, state: WorkspaceState) => {
  writeWorkspaceState(requireActiveRoot(), state);
  return true;
});

ipcMain.handle("layout:read", async () => {
  return readLayoutPrefsFile(layoutPrefsFilePath());
});

ipcMain.handle("layout:save", async (_event, prefs: LayoutPrefs) => {
  writeLayoutPrefsFile(layoutPrefsFilePath(), prefs);
  return true;
});

ipcMain.handle("settings:read", async () => {
  return readAppSettingsFile(appSettingsFilePath());
});

ipcMain.handle("settings:save", async (_event, settings: AppSettings) => {
  writeAppSettingsFile(appSettingsFilePath(), settings);
  return true;
});

ipcMain.handle(
  "window:setTitleBarOverlay",
  async (_event, colors: { color: string; symbolColor: string }) => {
    // setTitleBarOverlay is Windows-only; no-op (and possibly a throw) elsewhere.
    try {
      win?.setTitleBarOverlay({ ...colors, height: 32 });
    } catch {
      // unsupported platform — the window just keeps its native chrome
    }
    return true;
  }
);

ipcMain.handle("notesFolder:openOrCreateDailyNote", async (_event, root: string) => {
  const dateFormat = readAppSettingsFile(appSettingsFilePath()).dateFormat;
  return openOrCreateDailyNote(root, dateFormat, new Date());
});

ipcMain.handle(
  "notesFolder:createNote",
  async (_event, dir: string, title: string, templateId?: string) => {
    requireActiveRoot();
    const safeTitle = title.trim() || "New File";
    const fullPath = uniqueNotePath(dir, safeTitle);
    const addHeading = readAppSettingsFile(appSettingsFilePath()).addHeadingToNewNotes;
    const scaffold = findNoteTemplate(templateId).build(safeTitle, addHeading);
    fs.writeFileSync(fullPath, scaffold, "utf-8");
    return fullPath;
  }
);

ipcMain.handle("templates:list", async () => {
  return listAllFileTemplates(readNotesFoldersFile(notesFoldersFilePath()));
});

ipcMain.handle("templates:convert", async (_event, root: string, absPath: string) => {
  return convertToTemplate(root, absPath);
});

ipcMain.handle(
  "templates:createNote",
  async (_event, dir: string, title: string, templatePath: string, values: Record<string, string>) => {
    requireActiveRoot();
    const safeTitle = title.trim() || "New File";
    const fullPath = uniqueNotePath(dir, safeTitle);
    const raw = await fs.promises.readFile(templatePath, "utf-8");
    const now = new Date();
    const appSettings = readAppSettingsFile(appSettingsFilePath());
    const expanded = expandBuiltInDateVars(raw, now, {
      date: appSettings.dateFormat,
      time: appSettings.timeFormat,
      datetime: appSettings.datetimeFormat,
    });
    fs.writeFileSync(fullPath, renderTemplate(expanded, { ...values, title: safeTitle }), "utf-8");
    return fullPath;
  }
);

// Seeds the currently open (empty) notes folder with a few example notes —
// offered from the sidebar in place of a blank file tree so a first-time
// user has something to explore instead of a blank canvas. Skips any file
// that would collide with something already on disk, so it's safe to call
// more than once.
ipcMain.handle("notesFolder:seedStarterContent", async () => {
  const root = requireActiveRoot();
  const created: string[] = [];
  for (const note of STARTER_NOTES) {
    const fullPath = path.join(root, note.fileName);
    if (fs.existsSync(fullPath)) continue;
    fs.writeFileSync(fullPath, note.content, "utf-8");
    created.push(fullPath);
  }
  return created;
});

ipcMain.handle("notesFolder:deleteNote", async (_event, absPath: string) => {
  assertOwnsPath(absPath);
  fs.rmSync(absPath, { force: true });
  return true;
});

ipcMain.handle(
  "notesFolder:renameNote",
  async (_event, absPath: string, newTitle: string, updateLinks: boolean) => {
    const root = requireActiveRoot();
    assertOwnsPath(absPath);
    const dir = path.dirname(absPath);
    const oldTitle = titleFromPath(path.relative(root, absPath));
    const newPath = path.join(dir, `${newTitle}.md`);
    fs.renameSync(absPath, newPath);

    if (updateLinks) {
      // Rewrite [[oldTitle]] references across the notes folder.
      const linkRe = new RegExp(`\\[\\[(${escapeRegExp(oldTitle)})((?:#[^\\]|]+)?(?:\\|[^\\]]+)?)\\]\\]`, "g");

      const notes = await loadNotesFolder(root);
      for (const note of notes) {
        if (!note.content.includes(`[[${oldTitle}`)) continue;
        const raw = await fs.promises.readFile(note.path, "utf-8");
        const updated = raw.replace(linkRe, (_m, _matchedTarget, suffix) => `[[${newTitle}${suffix}]]`);
        if (updated !== raw) await fs.promises.writeFile(note.path, updated, "utf-8");
      }
    }

    return newPath;
  }
);

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Resolves a plugin RPC's relative path against the currently-open notes
// folder's root.
function resolveWithinActiveRoot(relativePath: string): string {
  const root = requireActiveRoot();
  const resolved = path.resolve(root, relativePath);
  const rel = path.relative(root, resolved);
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    throw new Error("Path escapes the notes folder root");
  }
  return resolved;
}

ipcMain.handle("plugin:notes:read", async (_event, relativePath: string) => {
  return readNoteBody(resolveWithinActiveRoot(relativePath));
});

ipcMain.handle("plugin:notes:write", async (_event, relativePath: string, body: string) => {
  saveNoteBody(resolveWithinActiveRoot(relativePath), body);
  return true;
});

ipcMain.handle("plugin:getPermissions", async () => {
  return readPluginPermissionsFile(pluginPermissionsFilePath());
});

ipcMain.handle(
  "plugin:requestPermission",
  async (_event, pluginId: string, pluginName: string, permission: PluginPermission) => {
    const permissions = readPluginPermissionsFile(pluginPermissionsFilePath());
    if (hasPermission(permissions, pluginId, permission)) return true;
    if (!win) return false;

    const result = await dialog.showMessageBox(win, {
      type: "question",
      buttons: ["Deny", "Allow"],
      defaultId: 0,
      cancelId: 0,
      title: "Plugin permission request",
      message: `"${pluginName}" wants to use "${permission}"`,
      detail: "This grants the plugin capability beyond reading and writing notes in this notes folder.",
    });
    const granted = result.response === 1;
    if (granted) {
      writePluginPermissionsFile(pluginPermissionsFilePath(), grantPermission(permissions, pluginId, permission));
    }
    return granted;
  }
);

ipcMain.handle("plugin:revokePermission", async (_event, pluginId: string, permission: PluginPermission) => {
  const permissions = readPluginPermissionsFile(pluginPermissionsFilePath());
  writePluginPermissionsFile(pluginPermissionsFilePath(), revokePermission(permissions, pluginId, permission));
  return true;
});

app.on("window-all-closed", () => {
  stopSession();
  if (process.platform !== "darwin") {
    app.quit();
    win = null;
  }
});

// One-time migration from the pre-rename storage layout: stacks.json ->
// notesFolders.json, and each notes folder's <root>/.stack/properties.yaml ->
// <root>/.cairn/properties.yaml (also fixing that it used to live in a
// differently-named hidden folder than everything else under .cairn).
// Follows the same rename-in-place pattern the old merged-view feature's
// migration used.
function migrateNotesFolderStorage(): void {
  const userDataDir = app.getPath("userData");
  const oldFile = path.join(userDataDir, "stacks.json");
  const newFile = path.join(userDataDir, "notesFolders.json");
  if (fs.existsSync(oldFile) && !fs.existsSync(newFile)) fs.renameSync(oldFile, newFile);

  const notesFolders = readNotesFoldersFile(newFile);
  for (const folder of notesFolders) {
    const oldDir = path.join(folder.root, ".stack");
    const newDir = path.join(folder.root, ".cairn");
    if (!fs.existsSync(oldDir)) continue;
    const oldPropertiesFile = path.join(oldDir, "properties.yaml");
    if (!fs.existsSync(oldPropertiesFile)) continue;
    fs.mkdirSync(newDir, { recursive: true });
    const newPropertiesFile = path.join(newDir, "properties.yaml");
    if (!fs.existsSync(newPropertiesFile)) fs.renameSync(oldPropertiesFile, newPropertiesFile);
  }
}

registerPluginScheme();
app.whenReady().then(() => {
  migrateNotesFolderStorage();
  createWindow();
  handlePluginProtocol(() => discoverPlugins(pluginsDirPath()), pluginPermissionsFilePath());
});
