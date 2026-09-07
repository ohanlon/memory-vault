import fs from "node:fs";
import path from "node:path";
import chokidar, { type FSWatcher } from "chokidar";
import { parseNote } from "../shared/parseNote";
import { writeStackCache } from "./stackCache";
import type { FileChangeEvent, FolderEntry, Note } from "../shared/types";

async function walkDir(root: string, dir: string, out: string[]): Promise<void> {
  const entries = await fs.promises.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await walkDir(root, full, out);
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith(".md")) {
      out.push(full);
    }
  }
}

async function walkDirs(root: string, dir: string, out: FolderEntry[]): Promise<void> {
  const entries = await fs.promises.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;
    if (entry.isDirectory()) {
      const full = path.join(dir, entry.name);
      out.push({ path: full, relativePath: path.relative(root, full) });
      await walkDirs(root, full, out);
    }
  }
}

export async function listFolders(root: string): Promise<FolderEntry[]> {
  const out: FolderEntry[] = [];
  await walkDirs(root, root, out);
  return out;
}

/** All markdown files under root, excluding dotfolders (e.g. .cairn) and dotfiles. */
export async function listMarkdownFiles(root: string): Promise<string[]> {
  const out: string[] = [];
  await walkDir(root, root, out);
  return out;
}

export async function readNote(root: string, absPath: string): Promise<Note> {
  const [raw, stat] = await Promise.all([
    fs.promises.readFile(absPath, "utf-8"),
    fs.promises.stat(absPath),
  ]);
  return parseNote({
    path: absPath,
    relativePath: path.relative(root, absPath),
    raw,
    mtimeMs: stat.mtimeMs,
  });
}

// Reads and parses every note asynchronously (fs.promises I/O runs off the
// main thread) so loading a large vault doesn't block the main process —
// and with it every window's IPC and rendering — for the whole walk. If
// `previous` is given (keyed by relativePath), a file whose mtime matches its
// previous entry is reused as-is instead of being re-read/re-parsed, so a
// reload of a mostly-unchanged vault only pays for what actually changed.
export async function loadStack(root: string, previous?: Map<string, Note>): Promise<Note[]> {
  const files = await listMarkdownFiles(root);
  const notes: Note[] = [];
  for (const file of files) {
    try {
      const relativePath = path.relative(root, file);
      const cached = previous?.get(relativePath);
      if (cached) {
        const stat = await fs.promises.stat(file);
        if (stat.mtimeMs === cached.mtimeMs) {
          notes.push(cached);
          continue;
        }
      }
      notes.push(await readNote(root, file));
    } catch {
      // skip unreadable/unparseable file rather than failing the whole stack load
    }
  }
  return notes;
}

function notesChanged(previous: Note[], notes: Note[]): boolean {
  const previousByPath = new Map(previous.map((n) => [n.relativePath, n.mtimeMs]));
  if (previousByPath.size !== notes.length) return true;
  for (const note of notes) {
    if (previousByPath.get(note.relativePath) !== note.mtimeMs) return true;
  }
  return false;
}

function foldersChanged(previous: FolderEntry[], folders: FolderEntry[]): boolean {
  const previousPaths = new Set(previous.map((f) => f.relativePath));
  if (previousPaths.size !== folders.length) return true;
  for (const folder of folders) {
    if (!previousPaths.has(folder.relativePath)) return true;
  }
  return false;
}

// Re-walks the vault, reusing unchanged notes (see loadStack's `previous`
// param), and returns the reconciled result only if something actually
// differs from `previousNotes`/`previousFolders` — otherwise returns null so
// callers can skip a wasted cache write/IPC push, which is the common case
// on every reopen of a vault nothing was edited in since it was last cached.
export async function reconcileStackCache(
  root: string,
  previousNotes: Note[],
  previousFolders: FolderEntry[]
): Promise<{ notes: Note[]; folders: FolderEntry[] } | null> {
  const previousByRelPath = new Map(previousNotes.map((n) => [n.relativePath, n]));
  const [notes, folders] = await Promise.all([loadStack(root, previousByRelPath), listFolders(root)]);
  if (!notesChanged(previousNotes, notes) && !foldersChanged(previousFolders, folders)) return null;
  writeStackCache(root, { notes, folders });
  return { notes, folders };
}

export function watchStack(
  root: string,
  onChange: (event: FileChangeEvent) => void
): FSWatcher {
  const watcher = chokidar.watch(root, {
    ignored: (p) => path.basename(p).startsWith(".") ,
    ignoreInitial: true,
    depth: Infinity,
  });

  watcher
    .on("add", (p) => {
      if (p.toLowerCase().endsWith(".md")) onChange({ kind: "add", path: p });
    })
    .on("change", (p) => {
      if (p.toLowerCase().endsWith(".md")) onChange({ kind: "change", path: p });
    })
    .on("unlink", (p) => {
      if (p.toLowerCase().endsWith(".md")) onChange({ kind: "unlink", path: p });
    })
    .on("addDir", (p) => onChange({ kind: "add", path: p }))
    .on("unlinkDir", (p) => onChange({ kind: "unlink", path: p }));

  return watcher;
}
