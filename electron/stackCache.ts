import fs from "node:fs";
import path from "node:path";
import type { FolderEntry, Note } from "../shared/types";

export interface StackCache {
  notes: Note[];
  folders: FolderEntry[];
}

export function stackCacheFilePath(stackRoot: string): string {
  return path.join(stackRoot, ".cairn", "index.json");
}

export function readStackCache(stackRoot: string): StackCache | null {
  const filePath = stackCacheFilePath(stackRoot);
  if (!fs.existsSync(filePath)) return null;
  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed?.notes) || !Array.isArray(parsed?.folders)) return null;
    return { notes: parsed.notes, folders: parsed.folders };
  } catch {
    return null;
  }
}

export function writeStackCache(stackRoot: string, cache: StackCache): void {
  const filePath = stackCacheFilePath(stackRoot);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(cache), "utf-8");
}
