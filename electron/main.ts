import { app, BrowserWindow, dialog, ipcMain, Menu, shell } from "electron";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { FSWatcher } from "chokidar";
import { listFolders, loadStack, readNote, watchStack } from "./stack";
import { addStack, readStacksFile, removeStack, renameStack, writeStacksFile } from "./stackRegistry";
import { titleFromPath } from "../shared/parseNote";
import { readNoteBody, readNoteProperties, saveNoteBody, saveNoteProperties } from "./noteProperties";
import { readPropertySchema, writePropertySchema } from "./propertiesSchema";
import { readLayoutPrefsFile, writeLayoutPrefsFile } from "./layoutPrefs";
import { readAppSettingsFile, writeAppSettingsFile } from "./appSettings";
import { openOrCreateDailyNote } from "./dailyNote";
import type { AppSettings, LayoutPrefs, PropertyDef } from "../shared/types";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

process.env.APP_ROOT = path.join(__dirname, "..");
export const VITE_DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL;
export const RENDERER_DIST = path.join(process.env.APP_ROOT, "dist");

let win: BrowserWindow | null = null;
let currentWatcher: FSWatcher | null = null;
let currentRoot: string | null = null;

function stacksFilePath(): string {
  return path.join(app.getPath("userData"), "stacks.json");
}

function layoutPrefsFilePath(): string {
  return path.join(app.getPath("userData"), "layout-prefs.json");
}

function appSettingsFilePath(): string {
  return path.join(app.getPath("userData"), "settings.json");
}

function createWindow() {
  Menu.setApplicationMenu(null);

  win = new BrowserWindow({
    width: 1280,
    height: 800,
    // Hides the title bar (icon, title text, menu) but keeps the native
    // minimize/maximize/close buttons via the overlay.
    titleBarStyle: "hidden",
    titleBarOverlay: {
      color: "#1e1f24",
      symbolColor: "#e6e6e6",
      height: 32,
    },
    webPreferences: {
      preload: path.join(__dirname, "preload.mjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
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

const OPEN_EXTERNAL_RE = /^(https?:|mailto:)/i;

ipcMain.handle("shell:openExternal", async (_event, url: string) => {
  if (!OPEN_EXTERNAL_RE.test(url)) return false;
  await shell.openExternal(url);
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
  currentRoot = root;
  const notes = loadStack(root);
  const folders = listFolders(root);

  currentWatcher = watchStack(root, (change) => {
    win?.webContents.send("stack:file-changed", change);
  });

  return { root, notes, folders };
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
    const scaffold = `---\ntags: []\n---\n\n# ${safeTitle}\n`;
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
  async (_event, absPath: string, newTitle: string) => {
    if (!currentRoot) throw new Error("No stack loaded");
    const dir = path.dirname(absPath);
    const oldTitle = titleFromPath(path.relative(currentRoot, absPath));
    const newPath = path.join(dir, `${newTitle}.md`);
    fs.renameSync(absPath, newPath);

    // Rewrite [[oldTitle]] references (and aliased/headered variants) across the stack.
    const notes = loadStack(currentRoot);
    const linkRe = new RegExp(
      `\\[\\[${escapeRegExp(oldTitle)}((?:#[^\\]|]+)?(?:\\|[^\\]]+)?)\\]\\]`,
      "g"
    );
    for (const note of notes) {
      if (!note.content.includes(`[[${oldTitle}`)) continue;
      const raw = fs.readFileSync(note.path, "utf-8");
      const updated = raw.replace(linkRe, (_m, suffix) => `[[${newTitle}${suffix}]]`);
      if (updated !== raw) fs.writeFileSync(note.path, updated, "utf-8");
    }

    return newPath;
  }
);

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

app.on("window-all-closed", () => {
  stopWatching();
  if (process.platform !== "darwin") {
    app.quit();
    win = null;
  }
});

app.whenReady().then(createWindow);
