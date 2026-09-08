import { app, BrowserWindow, dialog, ipcMain, Menu, nativeTheme, shell } from "electron";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { FSWatcher } from "chokidar";
import { listFolders, loadStack, reconcileStackCache, readNote, watchStack } from "./stack";
import { readStackCache, writeStackCache } from "./stackCache";
import { runSearch } from "./search";
import { addStack, readStacksFile, removeStack, renameStack, writeStacksFile } from "./stackRegistry";
import { titleFromPath } from "../shared/parseNote";
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
import type {
  AppSettings,
  FolderEntry,
  LayoutPrefs,
  Note,
  PluginPermission,
  PropertyDef,
  SearchOptions,
  ThemeSetting,
  WorkspaceState,
} from "../shared/types";

// Kept in step with the --bg-base/--text-primary custom properties in
// src/index.css for each theme, since the native titleBarOverlay buttons
// can't be styled with CSS.
const TITLE_BAR_OVERLAY_COLORS: Record<"dark" | "light", { color: string; symbolColor: string }> = {
  dark: { color: "#1e1f24", symbolColor: "#e6e6e6" },
  light: { color: "#ffffff", symbolColor: "#1f2328" },
};

function resolveTheme(theme: ThemeSetting): "dark" | "light" {
  if (theme === "system") return nativeTheme.shouldUseDarkColors ? "dark" : "light";
  return theme;
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));

process.env.APP_ROOT = path.join(__dirname, "..");
export const VITE_DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL;
export const RENDERER_DIST = path.join(process.env.APP_ROOT, "dist");

let win: BrowserWindow | null = null;
let currentWatcher: FSWatcher | null = null;
let currentRoot: string | null = null;
// Last notes handed back to the renderer for the current stack, used as the
// "previous" baseline for incremental reloads (stack:reload) so unchanged
// files aren't re-parsed.
let currentNotes: Note[] = [];
let searchCounter = 0;
const activeSearchIds = new Set<string>();
const cancelledSearchIds = new Set<string>();

function stacksFilePath(): string {
  return path.join(app.getPath("userData"), "stacks.json");
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

function createWindow() {
  Menu.setApplicationMenu(null);

  const initialTheme = resolveTheme(readAppSettingsFile(appSettingsFilePath()).theme);

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
      ...TITLE_BAR_OVERLAY_COLORS[initialTheme],
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

function stopWatching() {
  if (currentWatcher) {
    currentWatcher.close();
    currentWatcher = null;
  }
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
  shell.showItemInFolder(absPath);
  return true;
});

ipcMain.handle("stack:pick", async () => {
  if (!win) return null;
  const result = await dialog.showOpenDialog(win, {
    properties: ["openDirectory"],
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  return result.filePaths[0];
});

ipcMain.handle("stacks:list", async () => {
  return readStacksFile(stacksFilePath());
});

ipcMain.handle("stacks:add", async (_event, name: string, root: string) => {
  const stacks = readStacksFile(stacksFilePath());
  const updated = addStack(stacks, name, root); // throws on empty/duplicate name
  writeStacksFile(stacksFilePath(), updated);
  return updated;
});

ipcMain.handle("stacks:remove", async (_event, name: string) => {
  const stacks = readStacksFile(stacksFilePath());
  const updated = removeStack(stacks, name);
  writeStacksFile(stacksFilePath(), updated);
  return updated;
});

ipcMain.handle("stacks:rename", async (_event, oldName: string, newName: string) => {
  const stacks = readStacksFile(stacksFilePath());
  const updated = renameStack(stacks, oldName, newName); // throws on empty/duplicate name
  writeStacksFile(stacksFilePath(), updated);
  return updated;
});

ipcMain.handle("stack:load", async (_event, root: string) => {
  stopWatching();
  cancelAllSearches();
  currentRoot = root;

  // A cached vault (from a previous open) loads instantly and shows the
  // whole tree/graph right away; only a vault that's never been opened
  // before pays for a full synchronous walk, which then seeds the cache.
  const cached = readStackCache(root);
  let notes: Note[];
  let folders: FolderEntry[];
  if (cached) {
    notes = cached.notes;
    folders = cached.folders;
  } else {
    [notes, folders] = await Promise.all([loadStack(root), listFolders(root)]);
    writeStackCache(root, { notes, folders });
  }
  currentNotes = notes;

  currentWatcher = watchStack(root, (change) => {
    win?.webContents.send("stack:file-changed", change);
  });

  // Reconcile the cache against disk in the background — re-parses only
  // files whose mtime changed since the cache was written, and pushes the
  // reconciled result only if something actually differs (e.g. the vault
  // was edited outside the app while it was closed). The renderer treats
  // reconciliation as started the moment stack:load resolves (see
  // openStack), so only the "done" transition needs to be pushed here.
  reconcileStackCache(root, notes, folders)
    .then((result) => {
      if (!result || currentRoot !== root) return;
      currentNotes = result.notes;
      win?.webContents.send("stack:reconciled", { root, notes: result.notes, folders: result.folders });
    })
    .finally(() => {
      if (currentRoot !== root) return;
      win?.webContents.send("stack:reconcile-status", { root, reconciling: false });
    });

  return { root, notes, folders };
});

ipcMain.handle("stack:reload", async () => {
  if (!currentRoot) throw new Error("No stack loaded");
  const previous = new Map(currentNotes.map((n) => [n.relativePath, n]));
  const [notes, folders] = await Promise.all([loadStack(currentRoot, previous), listFolders(currentRoot)]);
  currentNotes = notes;
  writeStackCache(currentRoot, { notes, folders });
  return { notes, folders };
});

ipcMain.handle("search:start", async (_event, options: SearchOptions) => {
  if (!currentRoot) throw new Error("No stack loaded");
  const root = currentRoot;
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

ipcMain.handle("plugin:list", async () => {
  if (!currentRoot) return [];
  return discoverPlugins(currentRoot).map((p) => p.manifest);
});

ipcMain.handle("stack:readNote", async (_event, absPath: string) => {
  if (!currentRoot) throw new Error("No stack loaded");
  return readNote(currentRoot, absPath);
});

ipcMain.handle("stack:readRaw", async (_event, absPath: string) => {
  return fs.readFileSync(absPath, "utf-8");
});

ipcMain.handle("stack:saveNote", async (_event, absPath: string, body: string) => {
  saveNoteBody(absPath, body);
  return true;
});

ipcMain.handle("stack:readNoteBody", async (_event, absPath: string) => {
  return readNoteBody(absPath);
});

ipcMain.handle("stack:readNoteProperties", async (_event, absPath: string) => {
  return readNoteProperties(absPath);
});

ipcMain.handle(
  "stack:saveNoteProperties",
  async (_event, absPath: string, properties: Record<string, unknown>) => {
    saveNoteProperties(absPath, properties);
    return true;
  }
);

ipcMain.handle("stack:readPropertySchema", async () => {
  if (!currentRoot) return [];
  return readPropertySchema(currentRoot);
});

ipcMain.handle("stack:savePropertySchema", async (_event, properties: PropertyDef[]) => {
  if (!currentRoot) throw new Error("No stack loaded");
  writePropertySchema(currentRoot, properties);
  return properties;
});

ipcMain.handle("stack:readWorkspaceState", async () => {
  if (!currentRoot) return DEFAULT_WORKSPACE_STATE;
  return readWorkspaceState(currentRoot);
});

ipcMain.handle("stack:saveWorkspaceState", async (_event, state: WorkspaceState) => {
  if (!currentRoot) throw new Error("No stack loaded");
  writeWorkspaceState(currentRoot, state);
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

ipcMain.handle("window:setTitleBarOverlay", async (_event, theme: "dark" | "light") => {
  // setTitleBarOverlay is Windows-only; no-op (and possibly a throw) elsewhere.
  try {
    win?.setTitleBarOverlay({ ...TITLE_BAR_OVERLAY_COLORS[theme], height: 32 });
  } catch {
    // unsupported platform — the window just keeps its native chrome
  }
  return true;
});

ipcMain.handle("stack:openOrCreateDailyNote", async (_event, folder: string) => {
  if (!currentRoot) throw new Error("No stack loaded");
  return openOrCreateDailyNote(currentRoot, folder, app.getLocale(), new Date());
});

ipcMain.handle(
  "stack:createNote",
  async (_event, dir: string, title: string) => {
    if (!currentRoot) throw new Error("No stack loaded");
    const safeTitle = title.trim() || "New File";
    let fileName = `${safeTitle}.md`;
    let fullPath = path.join(dir, fileName);
    let n = 0;
    while (fs.existsSync(fullPath)) {
      n += 1;
      fileName = `${safeTitle} ${n}.md`;
      fullPath = path.join(dir, fileName);
    }
    const addHeading = readAppSettingsFile(appSettingsFilePath()).addHeadingToNewNotes;
    const scaffold = addHeading ? `---\ntags: []\n---\n\n# ${safeTitle}\n` : `---\ntags: []\n---\n\n`;
    fs.writeFileSync(fullPath, scaffold, "utf-8");
    return fullPath;
  }
);

ipcMain.handle("stack:deleteNote", async (_event, absPath: string) => {
  fs.rmSync(absPath, { force: true });
  return true;
});

ipcMain.handle(
  "stack:createFolder",
  async (_event, dir: string, name: string) => {
    const safeName = name.trim() || "New Folder";
    let folderName = safeName;
    let fullPath = path.join(dir, folderName);
    let n = 0;
    while (fs.existsSync(fullPath)) {
      n += 1;
      folderName = `${safeName} ${n}`;
      fullPath = path.join(dir, folderName);
    }
    fs.mkdirSync(fullPath, { recursive: true });
    return fullPath;
  }
);

ipcMain.handle("stack:deleteFolder", async (_event, absPath: string) => {
  fs.rmSync(absPath, { force: true, recursive: true });
  return true;
});

ipcMain.handle(
  "stack:moveNote",
  async (_event, absPath: string, destDir: string) => {
    if (path.dirname(absPath) === destDir) return absPath;
    const fileName = path.basename(absPath);
    const target = path.join(destDir, fileName);
    if (fs.existsSync(target)) {
      throw new Error(`"${fileName}" already exists in that folder`);
    }
    fs.renameSync(absPath, target);
    return target;
  }
);

ipcMain.handle(
  "stack:moveFolder",
  async (_event, absPath: string, destParentDir: string) => {
    if (path.dirname(absPath) === destParentDir) return absPath;
    const rel = path.relative(absPath, destParentDir);
    const isSelfOrDescendant = rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
    if (isSelfOrDescendant) {
      throw new Error("Can't move a folder into itself or one of its own subfolders");
    }
    const folderName = path.basename(absPath);
    const target = path.join(destParentDir, folderName);
    if (fs.existsSync(target)) {
      throw new Error(`"${folderName}" already exists in that folder`);
    }
    fs.renameSync(absPath, target);
    return target;
  }
);

// Shared by copyNote/copyFolder — picks the first non-colliding "name",
// "name copy", "name copy 2", ... in destDir, mirroring the "New File",
// "New File 1", ... dedupe pattern used by stack:createNote/createFolder.
function dedupeCopyName(destDir: string, baseName: string, ext: string): string {
  let name = `${baseName}${ext}`;
  if (!fs.existsSync(path.join(destDir, name))) return name;
  name = `${baseName} copy${ext}`;
  let n = 1;
  while (fs.existsSync(path.join(destDir, name))) {
    n += 1;
    name = `${baseName} copy ${n}${ext}`;
  }
  return name;
}

function copyFolderRecursive(src: string, dest: string): void {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) copyFolderRecursive(srcPath, destPath);
    else fs.copyFileSync(srcPath, destPath);
  }
}

ipcMain.handle(
  "stack:copyNote",
  async (_event, absPath: string, destDir: string) => {
    const ext = path.extname(absPath);
    const baseName = path.basename(absPath, ext);
    const target = path.join(destDir, dedupeCopyName(destDir, baseName, ext));
    fs.copyFileSync(absPath, target);
    return target;
  }
);

ipcMain.handle(
  "stack:copyFolder",
  async (_event, absPath: string, destParentDir: string) => {
    const rel = path.relative(absPath, destParentDir);
    const isSelfOrDescendant = rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
    if (isSelfOrDescendant) {
      throw new Error("Can't copy a folder into itself or one of its own subfolders");
    }
    const folderName = path.basename(absPath);
    const target = path.join(destParentDir, dedupeCopyName(destParentDir, folderName, ""));
    copyFolderRecursive(absPath, target);
    return target;
  }
);

ipcMain.handle(
  "stack:renameFolder",
  async (_event, absPath: string, newName: string) => {
    const dir = path.dirname(absPath);
    const target = path.join(dir, newName);
    if (target === absPath) return absPath;
    if (fs.existsSync(target)) {
      throw new Error(`"${newName}" already exists in that folder`);
    }
    fs.renameSync(absPath, target);
    return target;
  }
);

ipcMain.handle(
  "stack:renameNote",
  async (_event, absPath: string, newTitle: string, updateLinks: boolean) => {
    if (!currentRoot) throw new Error("No stack loaded");
    const dir = path.dirname(absPath);
    const oldTitle = titleFromPath(path.relative(currentRoot, absPath));
    const newPath = path.join(dir, `${newTitle}.md`);
    fs.renameSync(absPath, newPath);

    if (updateLinks) {
      // Rewrite [[oldTitle]] references (and aliased/headered variants) across the stack.
      const notes = await loadStack(currentRoot);
      const linkRe = new RegExp(
        `\\[\\[${escapeRegExp(oldTitle)}((?:#[^\\]|]+)?(?:\\|[^\\]]+)?)\\]\\]`,
        "g"
      );
      for (const note of notes) {
        if (!note.content.includes(`[[${oldTitle}`)) continue;
        const raw = await fs.promises.readFile(note.path, "utf-8");
        const updated = raw.replace(linkRe, (_m, suffix) => `[[${newTitle}${suffix}]]`);
        if (updated !== raw) await fs.promises.writeFile(note.path, updated, "utf-8");
      }
    }

    return newPath;
  }
);

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function resolveWithinStackRoot(root: string, relativePath: string): string {
  const resolved = path.resolve(root, relativePath);
  const rel = path.relative(root, resolved);
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    throw new Error("Path escapes the stack root");
  }
  return resolved;
}

ipcMain.handle("plugin:notes:read", async (_event, relativePath: string) => {
  if (!currentRoot) throw new Error("No stack loaded");
  return readNoteBody(resolveWithinStackRoot(currentRoot, relativePath));
});

ipcMain.handle("plugin:notes:write", async (_event, relativePath: string, body: string) => {
  if (!currentRoot) throw new Error("No stack loaded");
  saveNoteBody(resolveWithinStackRoot(currentRoot, relativePath), body);
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
      detail: "This grants the plugin capability beyond reading and writing notes in this stack.",
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
  stopWatching();
  if (process.platform !== "darwin") {
    app.quit();
    win = null;
  }
});

registerPluginScheme();
app.whenReady().then(() => {
  createWindow();
  handlePluginProtocol(() => (currentRoot ? discoverPlugins(currentRoot) : []), pluginPermissionsFilePath());
});
