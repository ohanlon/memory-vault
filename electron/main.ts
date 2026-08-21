import { app, BrowserWindow, dialog, ipcMain, Menu, shell } from "electron";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { FSWatcher } from "chokidar";
import { loadVault, readNote, watchVault } from "./vault";
import { addVault, readVaultsFile, removeVault, writeVaultsFile } from "./vaultRegistry";
import { titleFromPath } from "../shared/parseNote";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

process.env.APP_ROOT = path.join(__dirname, "..");
export const VITE_DEV_SERVER_URL = process.env.VITE_DEV_SERVER_URL;
export const RENDERER_DIST = path.join(process.env.APP_ROOT, "dist");

let win: BrowserWindow | null = null;
let currentWatcher: FSWatcher | null = null;
let currentRoot: string | null = null;

function vaultsFilePath(): string {
  return path.join(app.getPath("userData"), "vaults.json");
}

function createWindow() {
  Menu.setApplicationMenu(null);

  win = new BrowserWindow({
    width: 1280,
    height: 800,
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

ipcMain.handle("vault:pick", async () => {
  if (!win) return null;
  const result = await dialog.showOpenDialog(win, {
    properties: ["openDirectory"],
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  return result.filePaths[0];
});

ipcMain.handle("vaults:list", async () => {
  return readVaultsFile(vaultsFilePath());
});

ipcMain.handle("vaults:add", async (_event, name: string, root: string) => {
  const vaults = readVaultsFile(vaultsFilePath());
  const updated = addVault(vaults, name, root); // throws on empty/duplicate name
  writeVaultsFile(vaultsFilePath(), updated);
  return updated;
});

ipcMain.handle("vaults:remove", async (_event, name: string) => {
  const vaults = readVaultsFile(vaultsFilePath());
  const updated = removeVault(vaults, name);
  writeVaultsFile(vaultsFilePath(), updated);
  return updated;
});

ipcMain.handle("vault:load", async (_event, root: string) => {
  stopWatching();
  currentRoot = root;
  const notes = loadVault(root);

  currentWatcher = watchVault(root, (change) => {
    win?.webContents.send("vault:file-changed", change);
  });

  return { root, notes };
});

ipcMain.handle("vault:readNote", async (_event, absPath: string) => {
  if (!currentRoot) throw new Error("No vault loaded");
  return readNote(currentRoot, absPath);
});

ipcMain.handle("vault:readRaw", async (_event, absPath: string) => {
  return fs.readFileSync(absPath, "utf-8");
});

ipcMain.handle("vault:saveNote", async (_event, absPath: string, content: string) => {
  fs.writeFileSync(absPath, content, "utf-8");
  return true;
});

ipcMain.handle(
  "vault:createNote",
  async (_event, dir: string, title: string) => {
    if (!currentRoot) throw new Error("No vault loaded");
    const safeTitle = title.trim() || "Untitled";
    let fileName = `${safeTitle}.md`;
    let fullPath = path.join(dir, fileName);
    let n = 1;
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

ipcMain.handle("vault:deleteNote", async (_event, absPath: string) => {
  fs.rmSync(absPath, { force: true });
  return true;
});

ipcMain.handle(
  "vault:renameNote",
  async (_event, absPath: string, newTitle: string) => {
    if (!currentRoot) throw new Error("No vault loaded");
    const dir = path.dirname(absPath);
    const oldTitle = titleFromPath(path.relative(currentRoot, absPath));
    const newPath = path.join(dir, `${newTitle}.md`);
    fs.renameSync(absPath, newPath);

    // Rewrite [[oldTitle]] references (and aliased/headered variants) across the vault.
    const notes = loadVault(currentRoot);
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
