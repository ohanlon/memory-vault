import fs from "node:fs";
import path from "node:path";

// Which registered notes folders the CLI/MCP server may read/write - a
// separate, deny-by-default gate from notesFolders.json itself. Being
// registered in the GUI does not imply CLI/MCP access; a folder must be
// explicitly granted (see App.tsx's notes-folder context menu), the same
// opt-in-only philosophy as the plugin permission system
// (pluginPermissions.ts), applied to a different kind of caller.
export interface CliAccessFile {
  allowed: string[];
}

export function readCliAccessFile(filePath: string): CliAccessFile {
  if (!fs.existsSync(filePath)) return { allowed: [] };
  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.allowed)) return { allowed: [] };
    return { allowed: parsed.allowed.filter((v: unknown): v is string => typeof v === "string") };
  } catch {
    return { allowed: [] };
  }
}

export function writeCliAccessFile(filePath: string, access: CliAccessFile): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(access, null, 2), "utf-8");
}

export function isFolderAllowed(access: CliAccessFile, folderName: string): boolean {
  const lower = folderName.toLowerCase();
  return access.allowed.some((n) => n.toLowerCase() === lower);
}

export function allowFolder(access: CliAccessFile, folderName: string): CliAccessFile {
  if (isFolderAllowed(access, folderName)) return access;
  return { allowed: [...access.allowed, folderName] };
}

export function denyFolder(access: CliAccessFile, folderName: string): CliAccessFile {
  const lower = folderName.toLowerCase();
  return { allowed: access.allowed.filter((n) => n.toLowerCase() !== lower) };
}

// Keeps a grant attached to the right folder across a rename in the notes
// folder registry, so a renamed folder doesn't silently lose access it had,
// or keep access under a name that no longer refers to it.
export function renameFolderAccess(access: CliAccessFile, oldName: string, newName: string): CliAccessFile {
  if (!isFolderAllowed(access, oldName)) return access;
  return allowFolder(denyFolder(access, oldName), newName);
}
