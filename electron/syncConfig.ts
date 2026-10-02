import fs from "node:fs";
import path from "node:path";
import type { SyncConfigFile, SyncLink } from "../shared/types";

// Per-notes-folder GitHub link, keyed by registered folder name. Holds no
// secrets - the OAuth token lives in githubToken.ts.
export function readSyncConfigFile(filePath: string): SyncConfigFile {
  if (!fs.existsSync(filePath)) return {};
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const out: SyncConfigFile = {};
    for (const [name, link] of Object.entries(parsed as Record<string, SyncLink>)) {
      if (link && typeof link.repoFullName === "string" && typeof link.branch === "string") out[name] = link;
    }
    return out;
  } catch {
    return {};
  }
}

export function writeSyncConfigFile(filePath: string, config: SyncConfigFile): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(config, null, 2), "utf-8");
}

export function setSyncLink(config: SyncConfigFile, folderName: string, link: SyncLink): SyncConfigFile {
  return { ...removeSyncLink(config, folderName), [folderName]: link };
}

export function removeSyncLink(config: SyncConfigFile, folderName: string): SyncConfigFile {
  const lower = folderName.toLowerCase();
  return Object.fromEntries(Object.entries(config).filter(([n]) => n.toLowerCase() !== lower));
}

// Keeps a link attached to its folder across a registry rename.
export function renameSyncLink(config: SyncConfigFile, oldName: string, newName: string): SyncConfigFile {
  const entry = Object.entries(config).find(([n]) => n.toLowerCase() === oldName.toLowerCase());
  if (!entry) return config;
  return setSyncLink(removeSyncLink(config, oldName), newName, entry[1]);
}
