import fs from "node:fs";
import path from "node:path";
import { listMarkdownFiles, uniqueNotePath } from "./notesFolder";
import { addNotesFolder, findByNameCI, readNotesFoldersFile, writeNotesFoldersFile } from "./notesFolderRegistry";
import { readNoteProperties, saveNoteProperties } from "./noteProperties";
import { findPropertyByNameCI, readPropertySchema } from "./propertiesSchema";
import { searchContent } from "../shared/search";
import { validatePropertyValue } from "../shared/validateProperty";
import type { NotesFolderEntry, SearchMatch, SearchOptions } from "../shared/types";

export type CliResult = Record<string, unknown>;

const CLI_COMMANDS = new Set([
  "add_folder",
  "get_notes",
  "get_note",
  "add_note",
  "set_note",
  "update_note",
  "delete_note",
  "search_notes",
  "get_properties",
  "set_properties",
  "list_folders",
]);

// argv layout differs between `electron .` in dev (electron path, app path,
// ...args) and a packaged executable (exe path, ...args), so rather than
// assuming a fixed offset we just search for the first known command name.
export function extractCliArgs(argv: string[]): string[] | null {
  const idx = argv.findIndex((a) => CLI_COMMANDS.has(a));
  if (idx === -1) return null;
  return argv.slice(idx);
}

interface ParsedArgs {
  positional: string[];
  flags: Record<string, string | boolean>;
}

function parseArgs(args: string[]): ParsedArgs {
  const positional: string[] = [];
  const flags: Record<string, string | boolean> = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith("--")) {
      const key = arg.slice(2);
      const next = args[i + 1];
      if (next !== undefined && !next.startsWith("--")) {
        flags[key] = next;
        i++;
      } else {
        flags[key] = true;
      }
    } else {
      positional.push(arg);
    }
  }
  return { positional, flags };
}

function flagString(value: string | boolean | undefined): string | undefined {
  return typeof value === "string" ? value : undefined;
}

// Resolves --content/--content-file into the actual text: --content-file
// reads a file (useful for multiline text a shell can't easily pass as a
// single argument), --content is used verbatim, and if neither is given
// the caller decides whether that's an error (required) or just "".
function resolveContentFlag(flags: ParsedArgs["flags"], usage: string, required: boolean): string {
  const content = flagString(flags.content);
  const contentFile = flagString(flags["content-file"]);
  if (content !== undefined && contentFile !== undefined) {
    throw new Error(`Specify either --content or --content-file, not both. Usage: ${usage}`);
  }
  if (contentFile !== undefined) {
    if (!fs.existsSync(contentFile)) throw new Error(`Content file "${contentFile}" does not exist.`);
    return fs.readFileSync(contentFile, "utf-8");
  }
  if (content !== undefined) return content;
  if (required) throw new Error(`Usage: ${usage}`);
  return "";
}

function resolveFolder(notesFolders: NotesFolderEntry[], name: string): NotesFolderEntry {
  const entry = findByNameCI(notesFolders, name);
  if (!entry) {
    const known = notesFolders.map((f) => f.name).join(", ") || "(none)";
    throw new Error(`No notes folder named "${name}". Known notes folders: ${known}`);
  }
  return entry;
}

// "name", or "name 2", "name 3", ... incrementing past whatever name is
// already registered - mirrors uniqueNotePath's approach but for the
// notes-folder registry's name field instead of a file path.
function uniqueFolderName(notesFolders: NotesFolderEntry[], base: string): string {
  if (!findByNameCI(notesFolders, base)) return base;
  let n = 1;
  let candidate: string;
  do {
    n += 1;
    candidate = `${base} ${n}`;
  } while (findByNameCI(notesFolders, candidate));
  return candidate;
}

function sameRoot(a: string, b: string): boolean {
  const normalize = (p: string) => {
    const resolved = path.resolve(p);
    return process.platform === "win32" ? resolved.toLowerCase() : resolved;
  };
  return normalize(a) === normalize(b);
}

function ensureInside(root: string, target: string): void {
  const rel = path.relative(root, target);
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    throw new Error("Path escapes the notes folder");
  }
}

export function addFolder(notesFoldersFile: string, root: string, requestedName?: string): CliResult {
  const notesFolders = readNotesFoldersFile(notesFoldersFile);
  const resolvedRoot = path.resolve(root);

  const existing = notesFolders.find((f) => sameRoot(f.root, resolvedRoot));
  if (existing) {
    return {
      ok: true,
      alreadyExists: true,
      name: existing.name,
      root: existing.root,
      message: `"${resolvedRoot}" is already a notes folder, named "${existing.name}".`,
    };
  }

  fs.mkdirSync(resolvedRoot, { recursive: true });

  const desiredName = (requestedName ?? path.basename(resolvedRoot)).trim() || "Untitled";
  const finalName = uniqueFolderName(notesFolders, desiredName);
  writeNotesFoldersFile(notesFoldersFile, addNotesFolder(notesFolders, finalName, resolvedRoot));

  return {
    ok: true,
    alreadyExists: false,
    renamed: finalName !== desiredName,
    name: finalName,
    root: resolvedRoot,
    message:
      finalName !== desiredName
        ? `Created notes folder "${finalName}" (name "${desiredName}" was already in use).`
        : `Created notes folder "${finalName}".`,
  };
}

export async function getNotes(
  notesFoldersFile: string,
  folderName: string,
  includeSubfolders: boolean
): Promise<CliResult> {
  const entry = resolveFolder(readNotesFoldersFile(notesFoldersFile), folderName);

  let notes: string[];
  if (includeSubfolders) {
    notes = (await listMarkdownFiles(entry.root)).map((f) => path.relative(entry.root, f));
  } else {
    const dirEntries = await fs.promises.readdir(entry.root, { withFileTypes: true });
    notes = dirEntries
      .filter((e) => e.isFile() && !e.name.startsWith(".") && e.name.toLowerCase().endsWith(".md"))
      .map((e) => e.name);
  }

  return { ok: true, folder: entry.name, subfolders: includeSubfolders, notes };
}

export async function getNote(notesFoldersFile: string, folderName: string, notePath: string): Promise<CliResult> {
  const entry = resolveFolder(readNotesFoldersFile(notesFoldersFile), folderName);
  const fullPath = path.join(entry.root, notePath);
  ensureInside(entry.root, fullPath);

  if (!fs.existsSync(fullPath)) {
    return { ok: false, message: `Note "${notePath}" does not exist in notes folder "${entry.name}".` };
  }

  const content = await fs.promises.readFile(fullPath, "utf-8");
  return { ok: true, folder: entry.name, note: notePath, content };
}

export async function addNote(
  notesFoldersFile: string,
  folderName: string,
  title: string,
  content: string,
  subfolder?: string
): Promise<CliResult> {
  const entry = resolveFolder(readNotesFoldersFile(notesFoldersFile), folderName);

  const dir = subfolder ? path.join(entry.root, subfolder) : entry.root;
  ensureInside(entry.root, dir);
  fs.mkdirSync(dir, { recursive: true });

  const safeTitle = title.trim() || "New Note";
  const fullPath = uniqueNotePath(dir, safeTitle);
  await fs.promises.writeFile(fullPath, content, "utf-8");

  const finalTitle = path.basename(fullPath, ".md");
  const relPath = path.relative(entry.root, fullPath);
  return {
    ok: true,
    folder: entry.name,
    note: relPath,
    renamed: finalTitle !== safeTitle,
    message:
      finalTitle !== safeTitle
        ? `Created note "${finalTitle}" (title "${safeTitle}" was already in use).`
        : `Created note "${finalTitle}".`,
  };
}

// Creates the note at an exact path if it's missing, or overwrites it in
// place if it exists - the "upsert" a caller wants when maintaining a
// specific memory file it expects to keep writing back to, as opposed to
// addNote's auto-renaming-on-collision (right for a human clicking "New
// Note", wrong for an agent updating "user-preferences.md").
export async function setNote(
  notesFoldersFile: string,
  folderName: string,
  notePath: string,
  content: string
): Promise<CliResult> {
  const entry = resolveFolder(readNotesFoldersFile(notesFoldersFile), folderName);
  const fullPath = path.join(entry.root, notePath);
  ensureInside(entry.root, fullPath);

  const created = !fs.existsSync(fullPath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  await fs.promises.writeFile(fullPath, content, "utf-8");

  return {
    ok: true,
    folder: entry.name,
    note: notePath,
    created,
    message: created ? `Created note "${notePath}".` : `Overwrote note "${notePath}".`,
  };
}

function appendText(existing: string, text: string): string {
  const separator = existing.length > 0 && !existing.endsWith("\n") ? "\n" : "";
  return existing + separator + text;
}

const HEADING_RE = /^(#{1,6})\s+(.*?)\s*$/;

// Inserts `text` as a new line at the end of the section under the first
// heading matching `heading` (case-insensitive) - i.e. just before the next
// heading of the same or shallower level, or at the end of the note if it's
// the last section. Returns null if no heading matches.
function insertUnderHeading(existing: string, heading: string, text: string): string | null {
  const lines = existing.split("\n");
  const target = heading.trim().toLowerCase();

  let sectionStart = -1;
  let sectionLevel = 0;
  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(HEADING_RE);
    if (match && match[2].trim().toLowerCase() === target) {
      sectionStart = i;
      sectionLevel = match[1].length;
      break;
    }
  }
  if (sectionStart === -1) return null;

  let sectionEnd = lines.length;
  for (let i = sectionStart + 1; i < lines.length; i++) {
    const match = lines[i].match(HEADING_RE);
    if (match && match[1].length <= sectionLevel) {
      sectionEnd = i;
      break;
    }
  }
  // Trim trailing blank lines within the section so the new line lands
  // directly after its existing content instead of accumulating gaps.
  while (sectionEnd > sectionStart + 1 && lines[sectionEnd - 1].trim() === "") {
    sectionEnd--;
  }

  return [...lines.slice(0, sectionEnd), text, ...lines.slice(sectionEnd)].join("\n");
}

export async function updateNote(
  notesFoldersFile: string,
  folderName: string,
  notePath: string,
  additionalText: string,
  heading?: string
): Promise<CliResult> {
  const entry = resolveFolder(readNotesFoldersFile(notesFoldersFile), folderName);
  const fullPath = path.join(entry.root, notePath);
  ensureInside(entry.root, fullPath);

  if (!fs.existsSync(fullPath)) {
    return { ok: false, message: `Note "${notePath}" does not exist in notes folder "${entry.name}".` };
  }

  const existing = await fs.promises.readFile(fullPath, "utf-8");
  const content = heading !== undefined ? insertUnderHeading(existing, heading, additionalText) : appendText(existing, additionalText);
  if (content === null) {
    return { ok: false, message: `Heading "${heading}" was not found in note "${notePath}".` };
  }

  await fs.promises.writeFile(fullPath, content, "utf-8");
  return { ok: true, folder: entry.name, note: notePath, content };
}

export async function deleteNote(notesFoldersFile: string, folderName: string, notePath: string): Promise<CliResult> {
  const entry = resolveFolder(readNotesFoldersFile(notesFoldersFile), folderName);
  const fullPath = path.join(entry.root, notePath);
  ensureInside(entry.root, fullPath);

  if (!fs.existsSync(fullPath)) {
    return { ok: false, message: `Note "${notePath}" does not exist in notes folder "${entry.name}".` };
  }

  await fs.promises.rm(fullPath, { force: true });
  return { ok: true, folder: entry.name, note: notePath, message: `Deleted note "${notePath}".` };
}

export interface SearchNotesOptions {
  regex?: boolean;
  caseSensitive?: boolean;
  wholeWord?: boolean;
}

export async function searchNotes(
  notesFoldersFile: string,
  folderName: string,
  query: string,
  options: SearchNotesOptions
): Promise<CliResult> {
  const entry = resolveFolder(readNotesFoldersFile(notesFoldersFile), folderName);
  const files = await listMarkdownFiles(entry.root);

  const searchOptions: SearchOptions = {
    query,
    mode: options.regex ? "regex" : "plain",
    caseSensitive: Boolean(options.caseSensitive),
    wholeWord: Boolean(options.wholeWord),
  };

  const results: { note: string; matches: SearchMatch[] }[] = [];
  for (const file of files) {
    const content = await fs.promises.readFile(file, "utf-8");
    const matches = searchContent(content, searchOptions);
    if (matches.length > 0) {
      results.push({ note: path.relative(entry.root, file), matches });
    }
  }

  return { ok: true, folder: entry.name, query, results };
}

export function getProperties(notesFoldersFile: string, folderName: string, notePath: string): CliResult {
  const entry = resolveFolder(readNotesFoldersFile(notesFoldersFile), folderName);
  const fullPath = path.join(entry.root, notePath);
  ensureInside(entry.root, fullPath);

  if (!fs.existsSync(fullPath)) {
    return { ok: false, message: `Note "${notePath}" does not exist in notes folder "${entry.name}".` };
  }

  return { ok: true, folder: entry.name, note: notePath, properties: readNoteProperties(fullPath) };
}

// Merges `patch` into the note's existing frontmatter - a JSON Merge Patch
// (RFC 7396): keys not mentioned are left alone, and a key set to `null`
// removes that property instead of setting it. Validates against the
// notes folder's property schema if one exists, but (matching the GUI's
// Properties panel) validation is advisory only - an invalid value is
// still saved, just reported back as a warning.
export function setProperties(
  notesFoldersFile: string,
  folderName: string,
  notePath: string,
  patch: Record<string, unknown>
): CliResult {
  const entry = resolveFolder(readNotesFoldersFile(notesFoldersFile), folderName);
  const fullPath = path.join(entry.root, notePath);
  ensureInside(entry.root, fullPath);

  if (!fs.existsSync(fullPath)) {
    return { ok: false, message: `Note "${notePath}" does not exist in notes folder "${entry.name}".` };
  }

  const merged = { ...readNoteProperties(fullPath), ...patch };
  for (const [key, value] of Object.entries(patch)) {
    if (value === null) delete merged[key];
  }
  saveNoteProperties(fullPath, merged);

  const schema = readPropertySchema(entry.root);
  const warnings: Record<string, string> = {};
  for (const key of Object.keys(patch)) {
    if (patch[key] === null) continue;
    const def = findPropertyByNameCI(schema, key);
    const warning = def ? validatePropertyValue(def, merged[key]) : null;
    if (warning) warnings[key] = warning;
  }

  return {
    ok: true,
    folder: entry.name,
    note: notePath,
    properties: merged,
    ...(Object.keys(warnings).length > 0 ? { warnings } : {}),
  };
}

export function listFolders(notesFoldersFile: string): CliResult {
  const notesFolders = readNotesFoldersFile(notesFoldersFile);
  return { ok: true, folders: notesFolders.map((f) => ({ name: f.name, root: f.root })) };
}

export async function runCliCommand(args: string[], notesFoldersFile: string): Promise<CliResult> {
  const [command, ...rest] = args;
  const { positional, flags } = parseArgs(rest);

  switch (command) {
    case "add_folder": {
      const root = positional[0];
      if (!root) throw new Error("Usage: add_folder <path> [--name NAME]");
      return addFolder(notesFoldersFile, root, flagString(flags.name));
    }
    case "get_notes": {
      const folder = flagString(flags.folder);
      if (!folder) throw new Error("Usage: get_notes --folder NAME [--subfolders]");
      return getNotes(notesFoldersFile, folder, Boolean(flags.subfolders));
    }
    case "get_note": {
      const folder = flagString(flags.folder);
      const note = positional[0];
      if (!folder || !note) throw new Error("Usage: get_note --folder NAME <notePath>");
      return getNote(notesFoldersFile, folder, note);
    }
    case "add_note": {
      const usage = "add_note --folder NAME <title> [--subfolder PATH] [--content TEXT | --content-file PATH]";
      const folder = flagString(flags.folder);
      const title = positional[0];
      if (!folder || !title) throw new Error(`Usage: ${usage}`);
      const content = resolveContentFlag(flags, usage, false);
      return addNote(notesFoldersFile, folder, title, content, flagString(flags.subfolder));
    }
    case "set_note": {
      const usage = "set_note --folder NAME <notePath> (--content TEXT | --content-file PATH)";
      const folder = flagString(flags.folder);
      const note = positional[0];
      if (!folder || !note) throw new Error(`Usage: ${usage}`);
      const content = resolveContentFlag(flags, usage, true);
      return setNote(notesFoldersFile, folder, note, content);
    }
    case "update_note": {
      const usage =
        "update_note --folder NAME <notePath> (--content TEXT | --content-file PATH) [--heading NAME]";
      const folder = flagString(flags.folder);
      const note = positional[0];
      if (!folder || !note) throw new Error(`Usage: ${usage}`);
      const content = resolveContentFlag(flags, usage, true);
      return updateNote(notesFoldersFile, folder, note, content, flagString(flags.heading));
    }
    case "delete_note": {
      const folder = flagString(flags.folder);
      const note = positional[0];
      if (!folder || !note) throw new Error("Usage: delete_note --folder NAME <notePath>");
      return deleteNote(notesFoldersFile, folder, note);
    }
    case "search_notes": {
      const usage = "search_notes --folder NAME <query> [--regex] [--case-sensitive] [--whole-word]";
      const folder = flagString(flags.folder);
      const query = positional[0];
      if (!folder || !query) throw new Error(`Usage: ${usage}`);
      return searchNotes(notesFoldersFile, folder, query, {
        regex: Boolean(flags.regex),
        caseSensitive: Boolean(flags["case-sensitive"]),
        wholeWord: Boolean(flags["whole-word"]),
      });
    }
    case "get_properties": {
      const folder = flagString(flags.folder);
      const note = positional[0];
      if (!folder || !note) throw new Error("Usage: get_properties --folder NAME <notePath>");
      return getProperties(notesFoldersFile, folder, note);
    }
    case "set_properties": {
      const usage = `set_properties --folder NAME <notePath> --json '{"key":"value",...}'`;
      const folder = flagString(flags.folder);
      const note = positional[0];
      const json = flagString(flags.json);
      if (!folder || !note || json === undefined) throw new Error(`Usage: ${usage}`);
      let patch: unknown;
      try {
        patch = JSON.parse(json);
      } catch {
        throw new Error(`--json must be valid JSON. Usage: ${usage}`);
      }
      if (typeof patch !== "object" || patch === null || Array.isArray(patch)) {
        throw new Error(`--json must be a JSON object. Usage: ${usage}`);
      }
      return setProperties(notesFoldersFile, folder, note, patch as Record<string, unknown>);
    }
    case "list_folders":
      return listFolders(notesFoldersFile);
    default:
      throw new Error(`Unknown command "${command}"`);
  }
}
