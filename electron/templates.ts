import fs from "node:fs";
import path from "node:path";
import { uniqueNotePath } from "./notesFolder";
import type { FileTemplate, NotesFolderEntry } from "../shared/types";

/** Hidden so it's excluded from the note graph/search/watcher by the same
 *  dotfolder rule listMarkdownFiles and watchNotesFolder already apply. */
export const TEMPLATES_DIRNAME = ".templates";

export function templatesDirFor(root: string): string {
  return path.join(root, TEMPLATES_DIRNAME);
}

/** Every template file directly inside root's .templates folder — empty if the folder doesn't exist yet. */
export async function listFileTemplates(root: string): Promise<FileTemplate[]> {
  const dir = templatesDirFor(root);
  let entries: fs.Dirent[];
  try {
    entries = await fs.promises.readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries
    .filter((e) => e.isFile() && e.name.toLowerCase().endsWith(".md"))
    .map((e) => ({ path: path.join(dir, e.name), name: e.name.slice(0, -3) }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Every template across every registered notes folder — so a template
 *  created in one folder is available when creating a note in any other. */
export async function listAllFileTemplates(notesFolders: NotesFolderEntry[]): Promise<FileTemplate[]> {
  const perFolder = await Promise.all(notesFolders.map((folder) => listFileTemplates(folder.root)));
  return perFolder.flat().sort((a, b) => a.name.localeCompare(b.name));
}

/** Copies a note's raw content into root's .templates folder under its own title, numbering around name collisions. */
export async function convertToTemplate(root: string, absPath: string): Promise<string> {
  const dir = templatesDirFor(root);
  await fs.promises.mkdir(dir, { recursive: true });
  const raw = await fs.promises.readFile(absPath, "utf-8");
  const baseName = path.basename(absPath, path.extname(absPath));
  const fullPath = uniqueNotePath(dir, baseName);
  await fs.promises.writeFile(fullPath, raw, "utf-8");
  return fullPath;
}
