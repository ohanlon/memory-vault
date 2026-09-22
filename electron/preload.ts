import { contextBridge, ipcRenderer } from "electron";
import type {
  AppSettings,
  DailyNoteResult,
  FileChangeEvent,
  FileTemplate,
  LayoutPrefs,
  Note,
  NotesFolderEntry,
  NotesFolderIndex,
  NoteHistoryEntry,
  NotesFolderReconciledEvent,
  NotesFolderReconcileStatusEvent,
  PluginManifest,
  PluginPermission,
  PluginPermissionsFile,
  PropertyDef,
  ReplaceAllResult,
  SearchFileResult,
  SearchOptions,
  WorkspaceState,
} from "../shared/types";

const api = {
  pickNotesFolder: (): Promise<string | null> => ipcRenderer.invoke("notesFolder:pick"),
  loadNotesFolder: (root: string): Promise<NotesFolderIndex> =>
    ipcRenderer.invoke("notesFolder:load", root),
  reloadNotesFolder: (): Promise<{ notes: Note[] }> =>
    ipcRenderer.invoke("notesFolder:reload"),
  onReconciled: (cb: (event: NotesFolderReconciledEvent) => void): (() => void) => {
    const listener = (_e: unknown, event: NotesFolderReconciledEvent) => cb(event);
    ipcRenderer.on("notesFolder:reconciled", listener);
    return () => ipcRenderer.removeListener("notesFolder:reconciled", listener);
  },
  onReconcileStatus: (cb: (event: NotesFolderReconcileStatusEvent) => void): (() => void) => {
    const listener = (_e: unknown, event: NotesFolderReconcileStatusEvent) => cb(event);
    ipcRenderer.on("notesFolder:reconcile-status", listener);
    return () => ipcRenderer.removeListener("notesFolder:reconcile-status", listener);
  },
  listNotesFolders: (): Promise<NotesFolderEntry[]> => ipcRenderer.invoke("notesFolders:list"),
  addNotesFolder: (name: string, root: string): Promise<NotesFolderEntry[]> =>
    ipcRenderer.invoke("notesFolders:add", name, root),
  removeNotesFolder: (name: string): Promise<NotesFolderEntry[]> =>
    ipcRenderer.invoke("notesFolders:remove", name),
  renameNotesFolder: (oldName: string, newName: string): Promise<NotesFolderEntry[]> =>
    ipcRenderer.invoke("notesFolders:rename", oldName, newName),
  listCliAccess: (): Promise<string[]> => ipcRenderer.invoke("cliAccess:list"),
  setCliAccess: (name: string, allowed: boolean): Promise<string[]> =>
    ipcRenderer.invoke("cliAccess:set", name, allowed),
  readNote: (absPath: string): Promise<Note> =>
    ipcRenderer.invoke("notesFolder:readNote", absPath),
  readRaw: (absPath: string): Promise<string> =>
    ipcRenderer.invoke("notesFolder:readRaw", absPath),
  saveNote: (absPath: string, content: string): Promise<number> =>
    ipcRenderer.invoke("notesFolder:saveNote", absPath, content),
  createNote: (dir: string, title: string, templateId?: string): Promise<string> =>
    ipcRenderer.invoke("notesFolder:createNote", dir, title, templateId),
  seedStarterContent: (): Promise<string[]> => ipcRenderer.invoke("notesFolder:seedStarterContent"),
  listFileTemplates: (): Promise<FileTemplate[]> => ipcRenderer.invoke("templates:list"),
  convertToTemplate: (root: string, absPath: string): Promise<string> =>
    ipcRenderer.invoke("templates:convert", root, absPath),
  createNoteFromTemplate: (
    dir: string,
    title: string,
    templatePath: string,
    values: Record<string, string>
  ): Promise<string> => ipcRenderer.invoke("templates:createNote", dir, title, templatePath, values),
  deleteNote: (absPath: string): Promise<boolean> =>
    ipcRenderer.invoke("notesFolder:deleteNote", absPath),
  getNoteHistory: (absPath: string): Promise<NoteHistoryEntry[]> =>
    ipcRenderer.invoke("notesFolder:getNoteHistory", absPath),
  readNoteHistoryVersion: (absPath: string, timestamp: string): Promise<string | null> =>
    ipcRenderer.invoke("notesFolder:readNoteHistoryVersion", absPath, timestamp),
  restoreNoteVersion: (absPath: string, timestamp: string): Promise<number> =>
    ipcRenderer.invoke("notesFolder:restoreNoteVersion", absPath, timestamp),
  /** Resolves with the saved file's path relative to the notes folder root. */
  saveAttachment: (fileName: string, data: ArrayBuffer): Promise<string> =>
    ipcRenderer.invoke("attachments:save", fileName, data),
  renameNote: (absPath: string, newTitle: string, updateLinks: boolean): Promise<string> =>
    ipcRenderer.invoke("notesFolder:renameNote", absPath, newTitle, updateLinks),
  openExternal: (url: string): Promise<boolean> =>
    ipcRenderer.invoke("shell:openExternal", url),
  showItemInFolder: (absPath: string): Promise<boolean> =>
    ipcRenderer.invoke("shell:showItemInFolder", absPath),
  readNoteBody: (absPath: string): Promise<string> =>
    ipcRenderer.invoke("notesFolder:readNoteBody", absPath),
  readNoteProperties: (absPath: string): Promise<Record<string, unknown>> =>
    ipcRenderer.invoke("notesFolder:readNoteProperties", absPath),
  saveNoteProperties: (absPath: string, properties: Record<string, unknown>): Promise<boolean> =>
    ipcRenderer.invoke("notesFolder:saveNoteProperties", absPath, properties),
  readPropertySchema: (root: string): Promise<PropertyDef[]> =>
    ipcRenderer.invoke("notesFolder:readPropertySchema", root),
  savePropertySchema: (root: string, properties: PropertyDef[]): Promise<PropertyDef[]> =>
    ipcRenderer.invoke("notesFolder:savePropertySchema", root, properties),
  readWorkspaceState: (): Promise<WorkspaceState> =>
    ipcRenderer.invoke("notesFolder:readWorkspaceState"),
  saveWorkspaceState: (state: WorkspaceState): Promise<boolean> =>
    ipcRenderer.invoke("notesFolder:saveWorkspaceState", state),
  readLayoutPrefs: (): Promise<LayoutPrefs> => ipcRenderer.invoke("layout:read"),
  saveLayoutPrefs: (prefs: LayoutPrefs): Promise<boolean> => ipcRenderer.invoke("layout:save", prefs),
  readAppSettings: (): Promise<AppSettings> => ipcRenderer.invoke("settings:read"),
  saveAppSettings: (settings: AppSettings): Promise<boolean> => ipcRenderer.invoke("settings:save", settings),
  setTitleBarOverlay: (colors: { color: string; symbolColor: string }): Promise<boolean> =>
    ipcRenderer.invoke("window:setTitleBarOverlay", colors),
  openOrCreateDailyNote: (root: string): Promise<DailyNoteResult> =>
    ipcRenderer.invoke("notesFolder:openOrCreateDailyNote", root),
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
    ipcRenderer.on("notesFolder:file-changed", listener);
    return () => ipcRenderer.removeListener("notesFolder:file-changed", listener);
  },
  startSearch: (options: SearchOptions): Promise<string> =>
    ipcRenderer.invoke("search:start", options),
  cancelSearch: (searchId: string): Promise<boolean> =>
    ipcRenderer.invoke("search:cancel", searchId),
  replaceAll: (options: SearchOptions, replaceText: string): Promise<ReplaceAllResult> =>
    ipcRenderer.invoke("search:replaceAll", options, replaceText),
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
