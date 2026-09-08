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
} from "@shared/types";

export interface MemoryStackAPI {
  pickStack(): Promise<string | null>;
  loadStack(root: string): Promise<StackIndex>;
  reloadStack(): Promise<{ notes: Note[]; folders: FolderEntry[] }>;
  onReconciled(cb: (event: StackReconciledEvent) => void): () => void;
  onReconcileStatus(cb: (event: StackReconcileStatusEvent) => void): () => void;
  listStacks(): Promise<StackEntry[]>;
  addStack(name: string, root: string): Promise<StackEntry[]>;
  removeStack(name: string): Promise<StackEntry[]>;
  renameStack(oldName: string, newName: string): Promise<StackEntry[]>;
  readNote(absPath: string): Promise<Note>;
  readRaw(absPath: string): Promise<string>;
  saveNote(absPath: string, content: string): Promise<boolean>;
  createNote(dir: string, title: string, templateId?: string): Promise<string>;
  seedStarterContent(): Promise<string[]>;
  deleteNote(absPath: string): Promise<boolean>;
  renameNote(absPath: string, newTitle: string, updateLinks: boolean): Promise<string>;
  createFolder(dir: string, name: string): Promise<string>;
  deleteFolder(absPath: string): Promise<boolean>;
  moveNote(absPath: string, destDir: string): Promise<string>;
  moveFolder(absPath: string, destParentDir: string): Promise<string>;
  copyNote(absPath: string, destDir: string): Promise<string>;
  copyFolder(absPath: string, destParentDir: string): Promise<string>;
  renameFolder(absPath: string, newName: string): Promise<string>;
  openExternal(url: string): Promise<boolean>;
  showItemInFolder(absPath: string): Promise<boolean>;
  onFileChanged(cb: (event: FileChangeEvent) => void): () => void;
  readNoteBody(absPath: string): Promise<string>;
  readNoteProperties(absPath: string): Promise<Record<string, unknown>>;
  saveNoteProperties(absPath: string, properties: Record<string, unknown>): Promise<boolean>;
  readPropertySchema(): Promise<PropertyDef[]>;
  savePropertySchema(properties: PropertyDef[]): Promise<PropertyDef[]>;
  readWorkspaceState(): Promise<WorkspaceState>;
  saveWorkspaceState(state: WorkspaceState): Promise<boolean>;
  readLayoutPrefs(): Promise<LayoutPrefs>;
  saveLayoutPrefs(prefs: LayoutPrefs): Promise<boolean>;
  readAppSettings(): Promise<AppSettings>;
  saveAppSettings(settings: AppSettings): Promise<boolean>;
  setTitleBarOverlay(theme: "dark" | "light"): Promise<boolean>;
  openOrCreateDailyNote(folder: string): Promise<DailyNoteResult>;
  listPlugins(): Promise<PluginManifest[]>;
  getPluginPermissions(): Promise<PluginPermissionsFile>;
  revokePluginPermission(pluginId: string, permission: PluginPermission): Promise<boolean>;
  pluginNotesRead(relativePath: string): Promise<string>;
  pluginNotesWrite(relativePath: string, body: string): Promise<boolean>;
  pluginRequestPermission(pluginId: string, pluginName: string, permission: PluginPermission): Promise<boolean>;
  pluginOpenExternal(pluginId: string, url: string): Promise<boolean>;
  startSearch(options: SearchOptions): Promise<string>;
  cancelSearch(searchId: string): Promise<boolean>;
  onSearchResult(cb: (event: { searchId: string; result: SearchFileResult }) => void): () => void;
  onSearchDone(cb: (event: { searchId: string }) => void): () => void;
}

declare global {
  interface Window {
    memoryStack: MemoryStackAPI;
  }
}
