import fs from "node:fs";
import path from "node:path";
import { NOTES_FOLDER_AVATAR_COUNT, defaultAvatarIndexForName } from "../shared/avatars";
import type { AvatarRef, NotesFolderEntry } from "../shared/types";

export function readNotesFoldersFile(filePath: string): NotesFolderEntry[] {
  if (!fs.existsSync(filePath)) return [];
  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (v): v is NotesFolderEntry =>
        v && typeof v.name === "string" && typeof v.root === "string"
    );
  } catch {
    return [];
  }
}

export function writeNotesFoldersFile(filePath: string, notesFolders: NotesFolderEntry[]): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(notesFolders, null, 2), "utf-8");
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
