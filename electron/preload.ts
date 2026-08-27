import { contextBridge, ipcRenderer } from "electron";
import type {
  AppSettings,
  DailyNoteResult,
  FileChangeEvent,
  LayoutPrefs,
  Note,
  PropertyDef,
  VaultEntry,
  VaultIndex,
} from "../shared/types";

const api = {
  pickVault: (): Promise<string | null> => ipcRenderer.invoke("vault:pick"),
  loadVault: (root: string): Promise<VaultIndex> =>
    ipcRenderer.invoke("vault:load", root),
  listVaults: (): Promise<VaultEntry[]> => ipcRenderer.invoke("vaults:list"),
  addVault: (name: string, root: string): Promise<VaultEntry[]> =>
    ipcRenderer.invoke("vaults:add", name, root),
  removeVault: (name: string): Promise<VaultEntry[]> =>
    ipcRenderer.invoke("vaults:remove", name),
  readNote: (absPath: string): Promise<Note> =>
    ipcRenderer.invoke("vault:readNote", absPath),
  readRaw: (absPath: string): Promise<string> =>
    ipcRenderer.invoke("vault:readRaw", absPath),
  saveNote: (absPath: string, content: string): Promise<boolean> =>
    ipcRenderer.invoke("vault:saveNote", absPath, content),
  createNote: (dir: string, title: string): Promise<string> =>
    ipcRenderer.invoke("vault:createNote", dir, title),
  deleteNote: (absPath: string): Promise<boolean> =>
    ipcRenderer.invoke("vault:deleteNote", absPath),
  renameNote: (absPath: string, newTitle: string): Promise<string> =>
    ipcRenderer.invoke("vault:renameNote", absPath, newTitle),
  createFolder: (dir: string, name: string): Promise<string> =>
    ipcRenderer.invoke("vault:createFolder", dir, name),
  deleteFolder: (absPath: string): Promise<boolean> =>
    ipcRenderer.invoke("vault:deleteFolder", absPath),
  moveNote: (absPath: string, destDir: string): Promise<string> =>
    ipcRenderer.invoke("vault:moveNote", absPath, destDir),
  moveFolder: (absPath: string, destParentDir: string): Promise<string> =>
    ipcRenderer.invoke("vault:moveFolder", absPath, destParentDir),
  openExternal: (url: string): Promise<boolean> =>
    ipcRenderer.invoke("shell:openExternal", url),
  readNoteBody: (absPath: string): Promise<string> =>
    ipcRenderer.invoke("vault:readNoteBody", absPath),
  readNoteProperties: (absPath: string): Promise<Record<string, unknown>> =>
    ipcRenderer.invoke("vault:readNoteProperties", absPath),
  saveNoteProperties: (absPath: string, properties: Record<string, unknown>): Promise<boolean> =>
    ipcRenderer.invoke("vault:saveNoteProperties", absPath, properties),
  readPropertySchema: (): Promise<PropertyDef[]> =>
    ipcRenderer.invoke("vault:readPropertySchema"),
  savePropertySchema: (properties: PropertyDef[]): Promise<PropertyDef[]> =>
    ipcRenderer.invoke("vault:savePropertySchema", properties),
  readLayoutPrefs: (): Promise<LayoutPrefs> => ipcRenderer.invoke("layout:read"),
  saveLayoutPrefs: (prefs: LayoutPrefs): Promise<boolean> => ipcRenderer.invoke("layout:save", prefs),
  readAppSettings: (): Promise<AppSettings> => ipcRenderer.invoke("settings:read"),
  saveAppSettings: (settings: AppSettings): Promise<boolean> => ipcRenderer.invoke("settings:save", settings),
  openOrCreateDailyNote: (folder: string): Promise<DailyNoteResult> =>
    ipcRenderer.invoke("vault:openOrCreateDailyNote", folder),
  onFileChanged: (cb: (event: FileChangeEvent) => void): (() => void) => {
    const listener = (_e: unknown, change: FileChangeEvent) => cb(change);
    ipcRenderer.on("vault:file-changed", listener);
    return () => ipcRenderer.removeListener("vault:file-changed", listener);
  },
};

export type MemoryVaultAPI = typeof api;

contextBridge.exposeInMainWorld("memoryVault", api);
