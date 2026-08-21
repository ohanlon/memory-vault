import { contextBridge, ipcRenderer } from "electron";
import type { FileChangeEvent, Note, VaultEntry, VaultIndex } from "../shared/types";

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
  openExternal: (url: string): Promise<boolean> =>
    ipcRenderer.invoke("shell:openExternal", url),
  onFileChanged: (cb: (event: FileChangeEvent) => void): (() => void) => {
    const listener = (_e: unknown, change: FileChangeEvent) => cb(change);
    ipcRenderer.on("vault:file-changed", listener);
    return () => ipcRenderer.removeListener("vault:file-changed", listener);
  },
};

export type MemoryVaultAPI = typeof api;

contextBridge.exposeInMainWorld("memoryVault", api);
