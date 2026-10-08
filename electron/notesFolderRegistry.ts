import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { NOTES_FOLDER_AVATAR_COUNT, defaultAvatarIndexForName } from "../shared/avatars";
import { sanitizeDirName, uniqueDirName } from "../shared/folderDirName";
import type { AvatarRef, NotesFolderEntry } from "../shared/types";

// Where app-managed notes folders live. One function per platform host so a
// mobile host can return its sandbox's documents directory instead.
export function defaultNotesRoot(): string {
  return path.join(os.homedir(), "Documents", "Cairn");
}

export function readNotesFoldersFile(filePath: string, notesRoot: string = defaultNotesRoot()): NotesFolderEntry[] {
  if (!fs.existsSync(filePath)) return [];
  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((v) => v && typeof v.name === "string" && (typeof v.root === "string" || typeof v.dir === "string"))
      .map((v) => (typeof v.dir === "string" ? { ...v, root: path.join(notesRoot, v.dir) } : v));
  } catch {
    return [];
  }
}

export function writeNotesFoldersFile(filePath: string, notesFolders: NotesFolderEntry[]): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  // A managed folder's root is derived from `dir` on read; persisting it
  // would pin the registry to this machine's paths.
  const persisted = notesFolders.map((f) => {
    if (f.dir === undefined) return f;
    const { root: _root, ...rest } = f;
    return rest;
  });
  fs.writeFileSync(filePath, JSON.stringify(persisted, null, 2), "utf-8");
}

export function findByNameCI(notesFolders: NotesFolderEntry[], name: string): NotesFolderEntry | undefined {
  const lower = name.toLowerCase();
  return notesFolders.find((v) => v.name.toLowerCase() === lower);
}

export function addNotesFolder(notesFolders: NotesFolderEntry[], name: string, root: string): NotesFolderEntry[] {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Notes folder name cannot be empty");
  if (findByNameCI(notesFolders, trimmed)) {
    throw new Error(`A notes folder named "${trimmed}" already exists`);
  }
  const avatar: AvatarRef = { kind: "builtin", index: defaultAvatarIndexForName(trimmed, NOTES_FOLDER_AVATAR_COUNT) };
  return [...notesFolders, { name: trimmed, root, avatar }];
}

// Creates a registry entry for an app-managed folder at `<notesRoot>/<dir>`.
// The directory name is fixed at creation so renaming the display name later
// never has to move anything on disk.
export function addManagedNotesFolder(notesFolders: NotesFolderEntry[], name: string, notesRoot: string): NotesFolderEntry[] {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Notes folder name cannot be empty");
  if (findByNameCI(notesFolders, trimmed)) {
    throw new Error(`A notes folder named "${trimmed}" already exists`);
  }
  const taken = (candidate: string) => {
    const lower = candidate.toLowerCase();
    return (
      notesFolders.some((f) => f.dir?.toLowerCase() === lower) || fs.existsSync(path.join(notesRoot, candidate))
    );
  };
  const dir = uniqueDirName(sanitizeDirName(trimmed), taken);
  const avatar: AvatarRef = { kind: "builtin", index: defaultAvatarIndexForName(trimmed, NOTES_FOLDER_AVATAR_COUNT) };
  return [...notesFolders, { name: trimmed, dir, root: path.join(notesRoot, dir), avatar }];
}

export function removeNotesFolder(notesFolders: NotesFolderEntry[], name: string): NotesFolderEntry[] {
  const lower = name.toLowerCase();
  return notesFolders.filter((v) => v.name.toLowerCase() !== lower);
}

export function renameNotesFolder(notesFolders: NotesFolderEntry[], oldName: string, newName: string): NotesFolderEntry[] {
  const trimmed = newName.trim();
  if (!trimmed) throw new Error("Notes folder name cannot be empty");
  const lowerOld = oldName.toLowerCase();
  if (trimmed.toLowerCase() !== lowerOld && findByNameCI(notesFolders, trimmed)) {
    throw new Error(`A notes folder named "${trimmed}" already exists`);
  }
  return notesFolders.map((v) => (v.name.toLowerCase() === lowerOld ? { ...v, name: trimmed } : v));
}
