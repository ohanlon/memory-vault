import { contextBridge, ipcRenderer } from "electron";
import type {
  AppSettings,
  DailyNoteResult,
  FileChangeEvent,
  LayoutPrefs,
  Note,
  PluginManifest,
  PluginPermission,
  PluginPermissionsFile,
  PropertyDef,
  StackEntry,
  StackIndex,
} from "../shared/types";

const api = {
  pickStack: (): Promise<string | null> => ipcRenderer.invoke("stack:pick"),
  loadStack: (root: string): Promise<StackIndex> =>
    ipcRenderer.invoke("stack:load", root),
  listStacks: (): Promise<StackEntry[]> => ipcRenderer.invoke("stacks:list"),
  addStack: (name: string, root: string): Promise<StackEntry[]> =>
    ipcRenderer.invoke("stacks:add", name, root),
  removeStack: (name: string): Promise<StackEntry[]> =>
    ipcRenderer.invoke("stacks:remove", name),
  renameStack: (oldName: string, newName: string): Promise<StackEntry[]> =>
    ipcRenderer.invoke("stacks:rename", oldName, newName),
  readNote: (absPath: string): Promise<Note> =>
    ipcRenderer.invoke("stack:readNote", absPath),
  readRaw: (absPath: string): Promise<string> =>
    ipcRenderer.invoke("stack:readRaw", absPath),
  saveNote: (absPath: string, content: string): Promise<boolean> =>
    ipcRenderer.invoke("stack:saveNote", absPath, content),
  createNote: (dir: string, title: string): Promise<string> =>
    ipcRenderer.invoke("stack:createNote", dir, title),
  deleteNote: (absPath: string): Promise<boolean> =>
    ipcRenderer.invoke("stack:deleteNote", absPath),
  renameNote: (absPath: string, newTitle: string): Promise<string> =>
    ipcRenderer.invoke("stack:renameNote", absPath, newTitle),
  createFolder: (dir: string, name: string): Promise<string> =>
    ipcRenderer.invoke("stack:createFolder", dir, name),
  deleteFolder: (absPath: string): Promise<boolean> =>
    ipcRenderer.invoke("stack:deleteFolder", absPath),
  moveNote: (absPath: string, destDir: string): Promise<string> =>
    ipcRenderer.invoke("stack:moveNote", absPath, destDir),
  moveFolder: (absPath: string, destParentDir: string): Promise<string> =>
    ipcRenderer.invoke("stack:moveFolder", absPath, destParentDir),
  renameFolder: (absPath: string, newName: string): Promise<string> =>
    ipcRenderer.invoke("stack:renameFolder", absPath, newName),
  openExternal: (url: string): Promise<boolean> =>
    ipcRenderer.invoke("shell:openExternal", url),
  readNoteBody: (absPath: string): Promise<string> =>
    ipcRenderer.invoke("stack:readNoteBody", absPath),
  readNoteProperties: (absPath: string): Promise<Record<string, unknown>> =>
    ipcRenderer.invoke("stack:readNoteProperties", absPath),
  saveNoteProperties: (absPath: string, properties: Record<string, unknown>): Promise<boolean> =>
    ipcRenderer.invoke("stack:saveNoteProperties", absPath, properties),
  readPropertySchema: (): Promise<PropertyDef[]> =>
    ipcRenderer.invoke("stack:readPropertySchema"),
  savePropertySchema: (properties: PropertyDef[]): Promise<PropertyDef[]> =>
    ipcRenderer.invoke("stack:savePropertySchema", properties),
  readLayoutPrefs: (): Promise<LayoutPrefs> => ipcRenderer.invoke("layout:read"),
  saveLayoutPrefs: (prefs: LayoutPrefs): Promise<boolean> => ipcRenderer.invoke("layout:save", prefs),
  readAppSettings: (): Promise<AppSettings> => ipcRenderer.invoke("settings:read"),
  saveAppSettings: (settings: AppSettings): Promise<boolean> => ipcRenderer.invoke("settings:save", settings),
  setTitleBarOverlay: (theme: "dark" | "light"): Promise<boolean> =>
    ipcRenderer.invoke("window:setTitleBarOverlay", theme),
  openOrCreateDailyNote: (folder: string): Promise<DailyNoteResult> =>
    ipcRenderer.invoke("stack:openOrCreateDailyNote", folder),
  listPlugins: (): Promise<PluginManifest[]> => ipcRenderer.invoke("plugin:list"),
  getPluginPermissions: (): Promise<PluginPermissionsFile> =>
    ipcRenderer.invoke("plugin:getPermissions"),
  revokePluginPermission: (pluginId: string, permission: PluginPermission): Promise<boolean> =>
    ipcRenderer.invoke("plugin:revokePermission", pluginId, permission),
  onFileChanged: (cb: (event: FileChangeEvent) => void): (() => void) => {
    const listener = (_e: unknown, change: FileChangeEvent) => cb(change);
    ipcRenderer.on("stack:file-changed", listener);
    return () => ipcRenderer.removeListener("stack:file-changed", listener);
  },
};

export type MemoryStackAPI = typeof api;

contextBridge.exposeInMainWorld("memoryStack", api);
