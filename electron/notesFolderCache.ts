import fs from "node:fs";
import path from "node:path";
import type { Note } from "../shared/types";

export interface NotesFolderCache {
  notes: Note[];
}

export function notesFolderCacheFilePath(root: string): string {
  return path.join(root, ".cairn", "index.json");
}

export function readNotesFolderCache(root: string): NotesFolderCache | null {
  const filePath = notesFolderCacheFilePath(root);
  if (!fs.existsSync(filePath)) return null;
  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed?.notes)) return null;
    return { notes: parsed.notes };
  } catch {
    return null;
  }
}

export function writeNotesFolderCache(root: string, cache: NotesFolderCache): void {
  const filePath = notesFolderCacheFilePath(root);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(cache), "utf-8");
}
