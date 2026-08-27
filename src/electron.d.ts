import type {
  AppSettings,
  FileChangeEvent,
  LayoutPrefs,
  Note,
  PropertyDef,
  VaultEntry,
  VaultIndex,
} from "@shared/types";

export interface MemoryVaultAPI {
  pickVault(): Promise<string | null>;
  loadVault(root: string): Promise<VaultIndex>;
  listVaults(): Promise<VaultEntry[]>;
  addVault(name: string, root: string): Promise<VaultEntry[]>;
  removeVault(name: string): Promise<VaultEntry[]>;
  readNote(absPath: string): Promise<Note>;
  readRaw(absPath: string): Promise<string>;
  saveNote(absPath: string, content: string): Promise<boolean>;
  createNote(dir: string, title: string): Promise<string>;
  deleteNote(absPath: string): Promise<boolean>;
  renameNote(absPath: string, newTitle: string): Promise<string>;
  createFolder(dir: string, name: string): Promise<string>;
  deleteFolder(absPath: string): Promise<boolean>;
  moveNote(absPath: string, destDir: string): Promise<string>;
  moveFolder(absPath: string, destParentDir: string): Promise<string>;
  openExternal(url: string): Promise<boolean>;
  onFileChanged(cb: (event: FileChangeEvent) => void): () => void;
  readNoteBody(absPath: string): Promise<string>;
  readNoteProperties(absPath: string): Promise<Record<string, unknown>>;
  saveNoteProperties(absPath: string, properties: Record<string, unknown>): Promise<boolean>;
  readPropertySchema(): Promise<PropertyDef[]>;
  savePropertySchema(properties: PropertyDef[]): Promise<PropertyDef[]>;
  readLayoutPrefs(): Promise<LayoutPrefs>;
  saveLayoutPrefs(prefs: LayoutPrefs): Promise<boolean>;
  readAppSettings(): Promise<AppSettings>;
  saveAppSettings(settings: AppSettings): Promise<boolean>;
}

declare global {
  interface Window {
    memoryVault: MemoryVaultAPI;
  }
}
