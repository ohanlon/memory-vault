import type { FileChangeEvent, Note, VaultEntry, VaultIndex } from "@shared/types";

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
  openExternal(url: string): Promise<boolean>;
  onFileChanged(cb: (event: FileChangeEvent) => void): () => void;
}

declare global {
  interface Window {
    memoryVault: MemoryVaultAPI;
  }
}
