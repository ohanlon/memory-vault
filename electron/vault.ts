import fs from "node:fs";
import path from "node:path";
import chokidar, { type FSWatcher } from "chokidar";
import { parseNote } from "../shared/parseNote";
import type { FileChangeEvent, FolderEntry, Note } from "../shared/types";

function walkDir(root: string, dir: string, out: string[]): void {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkDir(root, full, out);
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith(".md")) {
      out.push(full);
    }
  }
}

function walkDirs(root: string, dir: string, out: FolderEntry[]): void {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;
    if (entry.isDirectory()) {
      const full = path.join(dir, entry.name);
      out.push({ path: full, relativePath: path.relative(root, full) });
      walkDirs(root, full, out);
    }
  }
}

export function listFolders(root: string): FolderEntry[] {
  const out: FolderEntry[] = [];
  walkDirs(root, root, out);
  return out;
}

export function readNote(root: string, absPath: string): Note {
  const raw = fs.readFileSync(absPath, "utf-8");
  const stat = fs.statSync(absPath);
  return parseNote({
    path: absPath,
    relativePath: path.relative(root, absPath),
    raw,
    mtimeMs: stat.mtimeMs,
  });
}

export function loadVault(root: string): Note[] {
  const files: string[] = [];
  walkDir(root, root, files);
  const notes: Note[] = [];
  for (const file of files) {
    try {
      notes.push(readNote(root, file));
    } catch {
      // skip unreadable/unparseable file rather than failing the whole vault load
    }
  }
  return notes;
}

export function watchVault(
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
