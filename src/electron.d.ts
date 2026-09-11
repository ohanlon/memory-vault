import type {
  AppSettings,
  CairnEntry,
  CairnIndex,
  DailyNoteResult,
  FileChangeEvent,
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
  reloadStack(): Promise<{ notes: Note[] }>;
  loadCairn(entries: { root: string; name: string }[]): Promise<CairnIndex>;
  reloadCairn(): Promise<{ notes: Note[] }>;
  onReconciled(cb: (event: StackReconciledEvent) => void): () => void;
  onReconcileStatus(cb: (event: StackReconcileStatusEvent) => void): () => void;
  listStacks(): Promise<StackEntry[]>;
  addStack(name: string, root: string): Promise<StackEntry[]>;
  removeStack(name: string): Promise<StackEntry[]>;
  renameStack(oldName: string, newName: string): Promise<StackEntry[]>;
  listCairns(): Promise<CairnEntry[]>;
  addCairn(name: string, memberStackNames: string[]): Promise<CairnEntry[]>;
  removeCairn(name: string): Promise<CairnEntry[]>;
  renameCairn(oldName: string, newName: string): Promise<CairnEntry[]>;
  updateCairnMembers(name: string, memberStackNames: string[]): Promise<CairnEntry[]>;
  readNote(absPath: string): Promise<Note>;
  readRaw(absPath: string): Promise<string>;
  saveNote(absPath: string, content: string): Promise<boolean>;
  createNote(dir: string, title: string, templateId?: string): Promise<string>;
  seedStarterContent(): Promise<string[]>;
  deleteNote(absPath: string): Promise<boolean>;
  renameNote(absPath: string, newTitle: string, updateLinks: boolean): Promise<string>;
  moveNoteToStack(absPath: string, destRoot: string): Promise<string>;
  openExternal(url: string): Promise<boolean>;
  showItemInFolder(absPath: string): Promise<boolean>;
  onFileChanged(cb: (event: FileChangeEvent) => void): () => void;
  readNoteBody(absPath: string): Promise<string>;
  readNoteProperties(absPath: string): Promise<Record<string, unknown>>;
  saveNoteProperties(absPath: string, properties: Record<string, unknown>): Promise<boolean>;
  readPropertySchema(stackRoot: string): Promise<PropertyDef[]>;
  savePropertySchema(stackRoot: string, properties: PropertyDef[]): Promise<PropertyDef[]>;
  readWorkspaceState(): Promise<WorkspaceState>;
  saveWorkspaceState(state: WorkspaceState): Promise<boolean>;
  readCairnWorkspaceState(cairnName: string): Promise<WorkspaceState>;
  saveCairnWorkspaceState(cairnName: string, state: WorkspaceState): Promise<boolean>;
  readLayoutPrefs(): Promise<LayoutPrefs>;
  saveLayoutPrefs(prefs: LayoutPrefs): Promise<boolean>;
  readAppSettings(): Promise<AppSettings>;
  saveAppSettings(settings: AppSettings): Promise<boolean>;
  setTitleBarOverlay(theme: "dark" | "light"): Promise<boolean>;
  openOrCreateDailyNote(stackRoot: string): Promise<DailyNoteResult>;
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
