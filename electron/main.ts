import { app, BrowserWindow, dialog, ipcMain, Menu, nativeTheme, shell } from "electron";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { FSWatcher } from "chokidar";
import { loadStack, reconcileStackCache, readNote, watchStack } from "./stack";
import { readStackCache, writeStackCache } from "./stackCache";
import { runSearch } from "./search";
import { addStack, readStacksFile, removeStack, renameStack, writeStacksFile } from "./stackRegistry";
import {
  addCairn,
  readCairnsFile,
  removeCairn,
  renameCairn,
  updateCairnMembers,
  writeCairnsFile,
} from "./cairnRegistry";
import { titleFromPath } from "../shared/parseNote";
import { STARTER_NOTES } from "../shared/starterContent";
import { findNoteTemplate } from "../shared/noteTemplates";
import { readNoteBody, readNoteProperties, saveNoteBody, saveNoteProperties } from "./noteProperties";
import { readPropertySchema, writePropertySchema } from "./propertiesSchema";
import { readLayoutPrefsFile, writeLayoutPrefsFile } from "./layoutPrefs";
import {
  readCairnWorkspaceState,
  readWorkspaceState,
  writeCairnWorkspaceState,
  writeWorkspaceState,
} from "./workspaceState";
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

// One entry per currently-open stack root. A plain single-stack session has
// exactly one entry (`name: null`, notes never carry Note.sourceStack); an
// open Cairn has one entry per member stack (`name` set to that stack's
// name, used to stamp Note.sourceStack on the notes handed to the
// renderer). `notes` is always the raw, unstamped result of loadStack — the
// same shape written to that root's on-disk cache — stamping happens only
// when building an IPC response/event.
interface StackSession {
  name: string | null;
  notes: Note[];
  watcher: FSWatcher;
}
const sessions = new Map<string, StackSession>();
// Ordered roots of the currently-open session — length 1 for a plain stack,
// length N for an open Cairn's N member stacks.
let activeRoots: string[] = [];

let searchCounter = 0;
const activeSearchIds = new Set<string>();
const cancelledSearchIds = new Set<string>();

function stampSourceStack(notes: Note[], name: string | null): Note[] {
  return name ? notes.map((n) => ({ ...n, sourceStack: name })) : notes;
}

function sessionNotes(root: string): Note[] {
  const session = sessions.get(root);
  if (!session) return [];
  return stampSourceStack(session.notes, session.name);
}

// Finds which currently-open root an absolute note path lives under — used
// by handlers that used to assume a single implicit `currentRoot`.
function ownerRootFor(absPath: string): string {
  const owner = activeRoots.find((root) => {
    const rel = path.relative(root, absPath);
    return rel !== "" && !rel.startsWith("..") && !path.isAbsolute(rel);
  });
  if (!owner) throw new Error("No open stack contains this path");
  return owner;
}

function stacksFilePath(): string {
  return path.join(app.getPath("userData"), "stacks.json");
}

function cairnsFilePath(): string {
  return path.join(app.getPath("userData"), "cairns.json");
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

function stopAllSessions() {
  for (const session of sessions.values()) session.watcher.close();
  sessions.clear();
  activeRoots = [];
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

ipcMain.handle("cairns:list", async () => {
  return readCairnsFile(cairnsFilePath());
});

ipcMain.handle("cairns:add", async (_event, name: string, memberStackNames: string[]) => {
  const cairns = readCairnsFile(cairnsFilePath());
  const updated = addCairn(cairns, name, memberStackNames); // throws on empty/duplicate name or <2 members
  writeCairnsFile(cairnsFilePath(), updated);
  return updated;
});

ipcMain.handle("cairns:remove", async (_event, name: string) => {
  const cairns = readCairnsFile(cairnsFilePath());
  const updated = removeCairn(cairns, name);
  writeCairnsFile(cairnsFilePath(), updated);
  return updated;
});

ipcMain.handle("cairns:rename", async (_event, oldName: string, newName: string) => {
  const cairns = readCairnsFile(cairnsFilePath());
  const updated = renameCairn(cairns, oldName, newName); // throws on empty/duplicate name
  writeCairnsFile(cairnsFilePath(), updated);
  return updated;
});

ipcMain.handle("cairns:updateMembers", async (_event, name: string, memberStackNames: string[]) => {
  const cairns = readCairnsFile(cairnsFilePath());
  const updated = updateCairnMembers(cairns, name, memberStackNames); // throws on <2 members
  writeCairnsFile(cairnsFilePath(), updated);
  return updated;
});

// Loads (or serves from cache) one root's notes and starts watching it —
// shared by both stack:load (a session of one root) and cairn:load (a
// session of N member-stack roots). A cached vault loads instantly; only a
// vault that's never been opened before pays for a full synchronous walk,
// which then seeds the cache.
async function openSessionRoot(root: string, name: string | null): Promise<void> {
  const cached = readStackCache(root);
  const notes = cached ? cached.notes : await loadStack(root);
  if (!cached) writeStackCache(root, { notes });

  const watcher = watchStack(root, (change) => {
    win?.webContents.send("stack:file-changed", change);
  });
  sessions.set(root, { name, notes, watcher });

  // Reconcile the cache against disk in the background — re-parses only
  // files whose mtime changed since the cache was written, and pushes the
  // reconciled result only if something actually differs (e.g. the vault
  // was edited outside the app while it was closed). The renderer treats
  // reconciliation as started the moment stack:load/cairn:load resolves
  // (see openStack/openCairn), so only the "done" transition needs to be
  // pushed here.
  reconcileStackCache(root, notes)
    .then((result) => {
      const session = sessions.get(root);
      if (!result || !session) return;
      session.notes = result.notes;
      win?.webContents.send("stack:reconciled", { root, notes: sessionNotes(root) });
    })
    .finally(() => {
      if (!sessions.has(root)) return;
      win?.webContents.send("stack:reconcile-status", { root, reconciling: false });
    });
}

async function reloadSessionRoot(root: string): Promise<Note[]> {
  const session = sessions.get(root);
  if (!session) throw new Error(`No open session for root: ${root}`);
  const previous = new Map(session.notes.map((n) => [n.relativePath, n]));
  const notes = await loadStack(root, previous);
  session.notes = notes;
  writeStackCache(root, { notes });
  return notes;
}

ipcMain.handle("stack:load", async (_event, root: string) => {
  stopAllSessions();
  cancelAllSearches();
  activeRoots = [root];
  await openSessionRoot(root, null);
  return { root, notes: sessionNotes(root) };
});

ipcMain.handle("stack:reload", async () => {
  if (activeRoots.length !== 1) throw new Error("No stack loaded");
  const notes = await reloadSessionRoot(activeRoots[0]);
  return { notes };
});

ipcMain.handle("cairn:load", async (_event, entries: { root: string; name: string }[]) => {
  stopAllSessions();
  cancelAllSearches();
  activeRoots = entries.map((e) => e.root);
  await Promise.all(entries.map((e) => openSessionRoot(e.root, e.name)));
  const notes = activeRoots.flatMap((root) => sessionNotes(root));
  return { roots: activeRoots, notes };
});

ipcMain.handle("cairn:reload", async () => {
  if (activeRoots.length === 0) throw new Error("No stack loaded");
  await Promise.all(activeRoots.map((root) => reloadSessionRoot(root)));
  const notes = activeRoots.flatMap((root) => sessionNotes(root));
  return { notes };
});

ipcMain.handle("search:start", async (_event, options: SearchOptions) => {
  if (activeRoots.length === 0) throw new Error("No stack loaded");
  const roots = activeRoots;
  const searchId = `search-${++searchCounter}`;
  activeSearchIds.add(searchId);

  Promise.all(
    roots.map((root) =>
      runSearch(
        root,
        options,
        (result) => win?.webContents.send("search:result", { searchId, result }),
        () => cancelledSearchIds.has(searchId)
      )
    )
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
  return discoverPlugins(pluginsDirPath()).map((p) => p.manifest);
});

ipcMain.handle("stack:readNote", async (_event, absPath: string) => {
  return readNote(ownerRootFor(absPath), absPath);
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

ipcMain.handle("stack:readPropertySchema", async (_event, stackRoot: string) => {
  return readPropertySchema(stackRoot);
});

ipcMain.handle("stack:savePropertySchema", async (_event, stackRoot: string, properties: PropertyDef[]) => {
  writePropertySchema(stackRoot, properties);
  return properties;
});

ipcMain.handle("stack:readWorkspaceState", async () => {
  if (activeRoots.length !== 1) return DEFAULT_WORKSPACE_STATE;
  return readWorkspaceState(activeRoots[0]);
});

ipcMain.handle("stack:saveWorkspaceState", async (_event, state: WorkspaceState) => {
  if (activeRoots.length !== 1) throw new Error("No stack loaded");
  writeWorkspaceState(activeRoots[0], state);
  return true;
});

ipcMain.handle("cairn:readWorkspaceState", async (_event, cairnName: string) => {
  return readCairnWorkspaceState(app.getPath("userData"), cairnName);
});

ipcMain.handle("cairn:saveWorkspaceState", async (_event, cairnName: string, state: WorkspaceState) => {
  writeCairnWorkspaceState(app.getPath("userData"), cairnName, state);
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

ipcMain.handle("stack:openOrCreateDailyNote", async (_event, stackRoot: string) => {
  return openOrCreateDailyNote(stackRoot, app.getLocale(), new Date());
});

ipcMain.handle(
  "stack:createNote",
  async (_event, dir: string, title: string, templateId?: string) => {
    if (activeRoots.length === 0) throw new Error("No stack loaded");
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
    const scaffold = findNoteTemplate(templateId).build(safeTitle, addHeading);
    fs.writeFileSync(fullPath, scaffold, "utf-8");
    return fullPath;
  }
);

// Seeds the currently open (empty) stack with a few example notes — offered
// from the sidebar in place of a blank file tree so a first-time user has
// something to explore instead of a blank canvas. Skips any file that would
// collide with something already on disk, so it's safe to call more than
// once.
ipcMain.handle("stack:seedStarterContent", async () => {
  // Only meaningful for a single freshly-opened, empty stack — a Cairn
  // always has 2+ member stacks that already existed independently.
  if (activeRoots.length !== 1) throw new Error("No stack loaded");
  const root = activeRoots[0];
  const created: string[] = [];
  for (const note of STARTER_NOTES) {
    const fullPath = path.join(root, note.fileName);
    if (fs.existsSync(fullPath)) continue;
    fs.writeFileSync(fullPath, note.content, "utf-8");
    created.push(fullPath);
  }
  return created;
});

ipcMain.handle("stack:deleteNote", async (_event, absPath: string) => {
  fs.rmSync(absPath, { force: true });
  return true;
});

ipcMain.handle(
  "stack:renameNote",
  async (_event, absPath: string, newTitle: string, updateLinks: boolean) => {
    const ownerRoot = ownerRootFor(absPath);
    const ownerName = sessions.get(ownerRoot)?.name ?? null;
    const dir = path.dirname(absPath);
    const oldTitle = titleFromPath(path.relative(ownerRoot, absPath));
    const newPath = path.join(dir, `${newTitle}.md`);
    fs.renameSync(absPath, newPath);

    if (updateLinks) {
      // Rewrite [[oldTitle]] (and, when this note's stack is part of an
      // open Cairn, the explicitly-qualified [[StackName/oldTitle]])
      // references, across every open root — a link to this note can live
      // in any member stack, not just its own.
      const bareTarget = oldTitle;
      const qualifiedTarget = ownerName ? `${ownerName}/${oldTitle}` : null;
      const alternation = [bareTarget, qualifiedTarget].filter((t): t is string => t !== null).map(escapeRegExp);
      const linkRe = new RegExp(`\\[\\[(${alternation.join("|")})((?:#[^\\]|]+)?(?:\\|[^\\]]+)?)\\]\\]`, "g");

      for (const root of activeRoots) {
        const notes = await loadStack(root);
        for (const note of notes) {
          if (!note.content.includes(`[[${bareTarget}`) && !(qualifiedTarget && note.content.includes(`[[${qualifiedTarget}`))) {
            continue;
          }
          const raw = await fs.promises.readFile(note.path, "utf-8");
          const updated = raw.replace(linkRe, (_m, matchedTarget, suffix) => {
            const newTarget = matchedTarget.includes("/") ? `${ownerName}/${newTitle}` : newTitle;
            return `[[${newTarget}${suffix}]]`;
          });
          if (updated !== raw) await fs.promises.writeFile(note.path, updated, "utf-8");
        }
      }
    }

    return newPath;
  }
);

// Moves a note to a different member stack of the currently open Cairn —
// notes aren't renamed by this (title, and therefore every [[link]] to it,
// stays valid), only their physical file/sourceStack changes.
ipcMain.handle(
  "stack:moveNoteToStack",
  async (_event, absPath: string, destRoot: string) => {
    if (!activeRoots.includes(destRoot)) throw new Error("Target stack is not open");
    if (path.dirname(absPath) === destRoot) return absPath;
    const fileName = path.basename(absPath);
    const target = path.join(destRoot, fileName);
    if (fs.existsSync(target)) {
      throw new Error(`"${fileName}" already exists in that stack`);
    }
    try {
      fs.renameSync(absPath, target);
    } catch (err) {
      // The two stacks can live on different drives, which a plain rename
      // can't cross — fall back to copy + delete.
      if ((err as NodeJS.ErrnoException).code !== "EXDEV") throw err;
      fs.copyFileSync(absPath, target);
      fs.rmSync(absPath, { force: true });
    }
    return target;
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

// Resolves a plugin RPC's relative path against whichever open root
// actually has a matching file, trying each active session root in turn —
// first match wins. A plugin call has no inherent "which stack" context of
// its own, and this is a smaller, less-used surface than the core
// note/graph experience, so this simple first-match resolution is a
// deliberate simplification rather than adding root-qualified paths to the
// plugin RPC surface.
function resolveWithinAnyActiveRoot(relativePath: string): string {
  if (activeRoots.length === 0) throw new Error("No stack loaded");
  for (const root of activeRoots) {
    try {
      const resolved = resolveWithinStackRoot(root, relativePath);
      if (fs.existsSync(resolved)) return resolved;
    } catch {
      // escapes this root — try the next one
    }
  }
  return resolveWithinStackRoot(activeRoots[0], relativePath);
}

ipcMain.handle("plugin:notes:read", async (_event, relativePath: string) => {
  return readNoteBody(resolveWithinAnyActiveRoot(relativePath));
});

ipcMain.handle("plugin:notes:write", async (_event, relativePath: string, body: string) => {
  saveNoteBody(resolveWithinAnyActiveRoot(relativePath), body);
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
  stopAllSessions();
  if (process.platform !== "darwin") {
    app.quit();
    win = null;
  }
});

registerPluginScheme();
app.whenReady().then(() => {
  createWindow();
  handlePluginProtocol(() => discoverPlugins(pluginsDirPath()), pluginPermissionsFilePath());
});
