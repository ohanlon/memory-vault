import type {
  AppSettings,
  DailyNoteResult,
  FileChangeEvent,
  FileTemplate,
  LayoutPrefs,
  Note,
  NoteHistoryEntry,
  NotesFolderEntry,
  NotesFolderIndex,
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
} from "@shared/types";

export interface MemoryStackAPI {
  pickNotesFolder(): Promise<string | null>;
  loadNotesFolder(root: string): Promise<NotesFolderIndex>;
  reloadNotesFolder(): Promise<{ notes: Note[] }>;
  onReconciled(cb: (event: NotesFolderReconciledEvent) => void): () => void;
  onReconcileStatus(cb: (event: NotesFolderReconcileStatusEvent) => void): () => void;
  listNotesFolders(): Promise<NotesFolderEntry[]>;
  addNotesFolder(name: string, root: string): Promise<NotesFolderEntry[]>;
  removeNotesFolder(name: string): Promise<NotesFolderEntry[]>;
  renameNotesFolder(oldName: string, newName: string): Promise<NotesFolderEntry[]>;
  listCliAccess(): Promise<string[]>;
  setCliAccess(name: string, allowed: boolean): Promise<string[]>;
  readNote(absPath: string): Promise<Note>;
  readRaw(absPath: string): Promise<string>;
  /** Resolves with the note's new mtime, so callers can tell their own save apart from a later external write. */
  saveNote(absPath: string, content: string): Promise<number>;
  createNote(dir: string, title: string, templateId?: string): Promise<string>;
  seedStarterContent(): Promise<string[]>;
  listFileTemplates(): Promise<FileTemplate[]>;
  convertToTemplate(root: string, absPath: string): Promise<string>;
  createNoteFromTemplate(
    dir: string,
    title: string,
    templatePath: string,
    values: Record<string, string>
  ): Promise<string>;
  deleteNote(absPath: string): Promise<boolean>;
  getNoteHistory(absPath: string): Promise<NoteHistoryEntry[]>;
  readNoteHistoryVersion(absPath: string, timestamp: string): Promise<string | null>;
  /** Resolves with the note's new mtime, mirroring saveNote, for the caller to re-baseline conflict detection. */
  restoreNoteVersion(absPath: string, timestamp: string): Promise<number>;
  /** Resolves with the saved file's path relative to the notes folder root. */
  saveAttachment(fileName: string, data: ArrayBuffer): Promise<string>;
  /** Resolves with root-relative paths (see saveAttachment) of every attachment no note currently embeds. */
  findOrphanedAttachments(root: string): Promise<string[]>;
  deleteOrphanedAttachments(root: string, relativePaths: string[]): Promise<boolean>;
  renameNote(absPath: string, newTitle: string, updateLinks: boolean): Promise<string>;
  openExternal(url: string): Promise<boolean>;
  showItemInFolder(absPath: string): Promise<boolean>;
  onFileChanged(cb: (event: FileChangeEvent) => void): () => void;
  readNoteBody(absPath: string): Promise<string>;
  readNoteProperties(absPath: string): Promise<Record<string, unknown>>;
  saveNoteProperties(absPath: string, properties: Record<string, unknown>): Promise<boolean>;
  readPropertySchema(root: string): Promise<PropertyDef[]>;
  savePropertySchema(root: string, properties: PropertyDef[]): Promise<PropertyDef[]>;
  readWorkspaceState(): Promise<WorkspaceState>;
  saveWorkspaceState(state: WorkspaceState): Promise<boolean>;
  readLayoutPrefs(): Promise<LayoutPrefs>;
  saveLayoutPrefs(prefs: LayoutPrefs): Promise<boolean>;
  readAppSettings(): Promise<AppSettings>;
  saveAppSettings(settings: AppSettings): Promise<boolean>;
  setTitleBarOverlay(colors: { color: string; symbolColor: string }): Promise<boolean>;
  openOrCreateDailyNote(root: string): Promise<DailyNoteResult>;
  listPlugins(): Promise<PluginManifest[]>;
  getPluginPermissions(): Promise<PluginPermissionsFile>;
  revokePluginPermission(pluginId: string, permission: PluginPermission): Promise<boolean>;
  pluginNotesRead(relativePath: string): Promise<string>;
  pluginNotesWrite(relativePath: string, body: string): Promise<boolean>;
  pluginRequestPermission(pluginId: string, pluginName: string, permission: PluginPermission): Promise<boolean>;
  pluginOpenExternal(pluginId: string, url: string): Promise<boolean>;
  startSearch(options: SearchOptions): Promise<string>;
  cancelSearch(searchId: string): Promise<boolean>;
  replaceAll(options: SearchOptions, replaceText: string): Promise<ReplaceAllResult>;
  onSearchResult(cb: (event: { searchId: string; result: SearchFileResult }) => void): () => void;
  onSearchDone(cb: (event: { searchId: string }) => void): () => void;
}

declare global {
  interface Window {
    memoryStack: MemoryStackAPI;
  }
}
