import fs from "node:fs";
import path from "node:path";
import chokidar, { type FSWatcher } from "chokidar";
import { parseNote } from "../shared/parseNote";
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
// and with it every window's IPC and rendering — for the whole walk.
export async function loadStack(root: string): Promise<Note[]> {
  const files = await listMarkdownFiles(root);
  const notes: Note[] = [];
  for (const file of files) {
    try {
      notes.push(await readNote(root, file));
    } catch {
      // skip unreadable/unparseable file rather than failing the whole stack load
    }
  }
  return notes;
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
