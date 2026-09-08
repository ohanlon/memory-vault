import { contextBridge, ipcRenderer } from "electron";
import type {
  AppSettings,
  DailyNoteResult,
  FileChangeEvent,
  FolderEntry,
  LayoutPrefs,
  Note,
  PluginManifest,
  PluginPermission,
  PluginPermissionsFile,
  PropertyDef,
  SearchFileResult,
  SearchOptions,
  StackEntry,
  StackIndex,
  StackReconciledEvent,
  StackReconcileStatusEvent,
  WorkspaceState,
} from "../shared/types";

const api = {
  pickStack: (): Promise<string | null> => ipcRenderer.invoke("stack:pick"),
  loadStack: (root: string): Promise<StackIndex> =>
    ipcRenderer.invoke("stack:load", root),
  reloadStack: (): Promise<{ notes: Note[]; folders: FolderEntry[] }> =>
    ipcRenderer.invoke("stack:reload"),
  onReconciled: (cb: (event: StackReconciledEvent) => void): (() => void) => {
    const listener = (_e: unknown, event: StackReconciledEvent) => cb(event);
    ipcRenderer.on("stack:reconciled", listener);
    return () => ipcRenderer.removeListener("stack:reconciled", listener);
  },
  onReconcileStatus: (cb: (event: StackReconcileStatusEvent) => void): (() => void) => {
    const listener = (_e: unknown, event: StackReconcileStatusEvent) => cb(event);
    ipcRenderer.on("stack:reconcile-status", listener);
    return () => ipcRenderer.removeListener("stack:reconcile-status", listener);
  },
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
  createNote: (dir: string, title: string, templateId?: string): Promise<string> =>
    ipcRenderer.invoke("stack:createNote", dir, title, templateId),
  seedStarterContent: (): Promise<string[]> => ipcRenderer.invoke("stack:seedStarterContent"),
  deleteNote: (absPath: string): Promise<boolean> =>
    ipcRenderer.invoke("stack:deleteNote", absPath),
  renameNote: (absPath: string, newTitle: string, updateLinks: boolean): Promise<string> =>
    ipcRenderer.invoke("stack:renameNote", absPath, newTitle, updateLinks),
  createFolder: (dir: string, name: string): Promise<string> =>
    ipcRenderer.invoke("stack:createFolder", dir, name),
  deleteFolder: (absPath: string): Promise<boolean> =>
    ipcRenderer.invoke("stack:deleteFolder", absPath),
  moveNote: (absPath: string, destDir: string): Promise<string> =>
    ipcRenderer.invoke("stack:moveNote", absPath, destDir),
  moveFolder: (absPath: string, destParentDir: string): Promise<string> =>
    ipcRenderer.invoke("stack:moveFolder", absPath, destParentDir),
  copyNote: (absPath: string, destDir: string): Promise<string> =>
    ipcRenderer.invoke("stack:copyNote", absPath, destDir),
  copyFolder: (absPath: string, destParentDir: string): Promise<string> =>
    ipcRenderer.invoke("stack:copyFolder", absPath, destParentDir),
  renameFolder: (absPath: string, newName: string): Promise<string> =>
    ipcRenderer.invoke("stack:renameFolder", absPath, newName),
  openExternal: (url: string): Promise<boolean> =>
    ipcRenderer.invoke("shell:openExternal", url),
  showItemInFolder: (absPath: string): Promise<boolean> =>
    ipcRenderer.invoke("shell:showItemInFolder", absPath),
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
  readWorkspaceState: (): Promise<WorkspaceState> =>
    ipcRenderer.invoke("stack:readWorkspaceState"),
  saveWorkspaceState: (state: WorkspaceState): Promise<boolean> =>
    ipcRenderer.invoke("stack:saveWorkspaceState", state),
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
  // Forwards RPC calls received from a plugin's sandboxed <iframe> (see
  // src/plugins/PluginViewFrame.tsx) to the same main-process handlers a
  // BrowserWindow-hosted plugin would call directly via its own preload.
  pluginNotesRead: (relativePath: string): Promise<string> =>
    ipcRenderer.invoke("plugin:notes:read", relativePath),
  pluginNotesWrite: (relativePath: string, body: string): Promise<boolean> =>
    ipcRenderer.invoke("plugin:notes:write", relativePath, body),
  pluginRequestPermission: (pluginId: string, pluginName: string, permission: PluginPermission): Promise<boolean> =>
    ipcRenderer.invoke("plugin:requestPermission", pluginId, pluginName, permission),
  pluginOpenExternal: (pluginId: string, url: string): Promise<boolean> =>
    ipcRenderer.invoke("plugin:openExternal", pluginId, url),
  onFileChanged: (cb: (event: FileChangeEvent) => void): (() => void) => {
    const listener = (_e: unknown, change: FileChangeEvent) => cb(change);
    ipcRenderer.on("stack:file-changed", listener);
    return () => ipcRenderer.removeListener("stack:file-changed", listener);
  },
  startSearch: (options: SearchOptions): Promise<string> =>
    ipcRenderer.invoke("search:start", options),
  cancelSearch: (searchId: string): Promise<boolean> =>
    ipcRenderer.invoke("search:cancel", searchId),
  onSearchResult: (
    cb: (event: { searchId: string; result: SearchFileResult }) => void
  ): (() => void) => {
    const listener = (_e: unknown, payload: { searchId: string; result: SearchFileResult }) =>
      cb(payload);
    ipcRenderer.on("search:result", listener);
    return () => ipcRenderer.removeListener("search:result", listener);
  },
  onSearchDone: (cb: (event: { searchId: string }) => void): (() => void) => {
    const listener = (_e: unknown, payload: { searchId: string }) => cb(payload);
    ipcRenderer.on("search:done", listener);
    return () => ipcRenderer.removeListener("search:done", listener);
  },
};

export type MemoryStackAPI = typeof api;

contextBridge.exposeInMainWorld("memoryStack", api);
