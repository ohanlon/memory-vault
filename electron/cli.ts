import fs from "node:fs";
import path from "node:path";
import { listMarkdownFiles, loadNotesFolder, uniqueNotePath } from "./notesFolder";
import { addNotesFolder, findByNameCI, readNotesFoldersFile, writeNotesFoldersFile } from "./notesFolderRegistry";
import { allowFolder, isFolderAllowed, readCliAccessFile, writeCliAccessFile } from "./cliAccess";
import { readNoteProperties, saveNoteProperties } from "./noteProperties";
import { listSnapshots, readSnapshot, recordSnapshot } from "./noteHistory";
import { deleteAttachments, findOrphanedAttachments } from "./attachments";
import { listFileTemplates } from "./templates";
import { findPropertyByNameCI, readPropertySchema } from "./propertiesSchema";
import { backlinkTitles, buildGraph } from "../shared/buildGraph";
import { titleFromPath } from "../shared/parseNote";
import { searchContent } from "../shared/search";
import { validatePropertyValue } from "../shared/validateProperty";
import { DEFAULT_APP_SETTINGS } from "../shared/appSettings";
import { expandBuiltInDateVars, renderTemplate } from "../shared/templateRender";
import type { Note, NotesFolderEntry, SearchMatch, SearchOptions } from "../shared/types";

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
  "get_backlinks",
  "get_tags",
  "list_folders",
  "get_note_history",
  "restore_note_version",
  "get_orphaned_attachments",
  "delete_orphaned_attachments",
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

function expectedMtimeFlag(flags: ParsedArgs["flags"], usage: string): number | undefined {
  const raw = flagString(flags["if-unmodified-since"]);
  if (raw === undefined) return undefined;
  const parsed = Number(raw);
  if (Number.isNaN(parsed)) throw new Error(`--if-unmodified-since must be a number (a note's mtimeMs). Usage: ${usage}`);
  return parsed;
}

// Reads stdin to completion synchronously - fine here since this only runs
// from the CLI dispatcher (a short-lived process whose one job is this
// command), never from the MCP server (which gets content as a plain string
// argument already and has no CLI flags to parse in the first place).
function defaultReadStdin(): string {
  return fs.readFileSync(0, "utf-8");
}

// Resolves --content/--content-file into the actual text: --content-file
// reads a file (useful for multiline text a shell can't easily pass as a
// single argument), or reads stdin to EOF if given "-" (the same convention
// driver.mjs and countless other CLIs use), --content is used verbatim, and
// if neither is given the caller decides whether that's an error (required)
// or just "". readStdin is injectable so tests don't block on the real fd 0.
function resolveContentFlag(
  flags: ParsedArgs["flags"],
  usage: string,
  required: boolean,
  readStdin: () => string = defaultReadStdin
): string {
  const content = flagString(flags.content);
  const contentFile = flagString(flags["content-file"]);
  if (content !== undefined && contentFile !== undefined) {
    throw new Error(`Specify either --content or --content-file, not both. Usage: ${usage}`);
  }
  if (contentFile !== undefined) {
    if (contentFile === "-") return readStdin();
    if (!fs.existsSync(contentFile)) throw new Error(`Content file "${contentFile}" does not exist.`);
    return fs.readFileSync(contentFile, "utf-8");
  }
  if (content !== undefined) return content;
  if (required) throw new Error(`Usage: ${usage}`);
  return "";
}

// The single choke point every operation below goes through, so a folder
// that hasn't been explicitly granted CLI/MCP access (see cliAccess.ts) is
// unreachable no matter which entry point (CLI dispatcher below, or an MCP
// tool calling an exported function directly) made the call.
function resolveFolder(notesFolders: NotesFolderEntry[], cliAccessFile: string, name: string): NotesFolderEntry {
  const entry = findByNameCI(notesFolders, name);
  if (!entry) {
    const known = notesFolders.map((f) => f.name).join(", ") || "(none)";
    throw new Error(`No notes folder named "${name}". Known notes folders: ${known}`);
  }
  if (!isFolderAllowed(readCliAccessFile(cliAccessFile), entry.name)) {
    throw new Error(
      `CLI/MCP access to notes folder "${entry.name}" has not been granted. Enable it from that folder's "..." menu in Cairn ("Allow CLI/MCP access").`
    );
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

// Optimistic-concurrency guard for update_note/set_note/set_properties/
// delete_note: a caller that captured a note's mtime from an earlier
// get_note/get_properties call can pass it back here, so a write that would
// clobber a change made since then (by the GUI, another CLI/MCP call, or a
// hand-edit) is rejected instead of silently overwriting it. Omitting
// expectedMtimeMs skips the check entirely, matching prior behavior.
function checkExpectedMtime(fullPath: string, expectedMtimeMs: number | undefined): CliResult | null {
  if (expectedMtimeMs === undefined) return null;
  const currentMtimeMs = fs.statSync(fullPath).mtimeMs;
  if (currentMtimeMs === expectedMtimeMs) return null;
  return {
    ok: false,
    conflict: true,
    message: `Note has changed since it was last read (expected mtime ${expectedMtimeMs}, found ${currentMtimeMs}). Re-fetch and retry.`,
    currentMtimeMs,
  };
}

// Registering a brand-new folder auto-grants it CLI/MCP access - the caller
// invoking add_folder already has CLI/MCP access by definition, so this
// just lets an agent bootstrap a fresh notes folder end-to-end. An already-
// registered folder (the alreadyExists branch) is deliberately NOT
// auto-granted: without that, a CLI/MCP caller could learn/guess the path
// of a folder a human registered through the GUI and grant itself access
// to it just by calling add_folder again with the same path.
export function addFolder(
  notesFoldersFile: string,
  cliAccessFile: string,
  root: string,
  requestedName?: string
): CliResult {
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
  writeCliAccessFile(cliAccessFile, allowFolder(readCliAccessFile(cliAccessFile), finalName));

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
  cliAccessFile: string,
  folderName: string,
  includeSubfolders: boolean
): Promise<CliResult> {
  const entry = resolveFolder(readNotesFoldersFile(notesFoldersFile), cliAccessFile, folderName);

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

export async function getNote(
  notesFoldersFile: string,
  cliAccessFile: string,
  folderName: string,
  notePath: string
): Promise<CliResult> {
  const entry = resolveFolder(readNotesFoldersFile(notesFoldersFile), cliAccessFile, folderName);
  const fullPath = path.join(entry.root, notePath);
  ensureInside(entry.root, fullPath);

  if (!fs.existsSync(fullPath)) {
    return { ok: false, message: `Note "${notePath}" does not exist in notes folder "${entry.name}".` };
  }

  const [content, stat] = await Promise.all([fs.promises.readFile(fullPath, "utf-8"), fs.promises.stat(fullPath)]);
  return { ok: true, folder: entry.name, note: notePath, content, mtimeMs: stat.mtimeMs };
}

// Renders one of the notes folder's custom file templates (".templates/",
// see electron/templates.ts - the same "Convert to Template" mechanism the
// GUI uses, not the 3 fixed built-in templates the GUI's "New Note" menu
// separately offers, which have no CLI equivalent). {{date}}/{{time}}/
// {{datetime}} tags use this app's default formats regardless of what the
// GUI's Settings has them configured to, since that's stored per-install
// and this may run from a machine with no GUI settings at all; a template
// can still override the format per-tag (e.g. {{date:YYYY/MM/DD}}).
async function renderNoteTemplate(
  root: string,
  templateName: string,
  title: string,
  values: Record<string, string> | undefined
): Promise<string> {
  const templates = await listFileTemplates(root);
  const template = templates.find((t) => t.name.toLowerCase() === templateName.toLowerCase());
  if (!template) {
    const known = templates.map((t) => t.name).join(", ") || "(none)";
    throw new Error(`No template named "${templateName}". Known templates: ${known}`);
  }
  const raw = await fs.promises.readFile(template.path, "utf-8");
  const expanded = expandBuiltInDateVars(raw, new Date(), {
    date: DEFAULT_APP_SETTINGS.dateFormat,
    time: DEFAULT_APP_SETTINGS.timeFormat,
    datetime: DEFAULT_APP_SETTINGS.datetimeFormat,
  });
  return renderTemplate(expanded, { ...values, title });
}

export async function addNote(
  notesFoldersFile: string,
  cliAccessFile: string,
  folderName: string,
  title: string,
  content: string,
  subfolder?: string,
  templateName?: string,
  templateValues?: Record<string, string>
): Promise<CliResult> {
  const entry = resolveFolder(readNotesFoldersFile(notesFoldersFile), cliAccessFile, folderName);

  const dir = subfolder ? path.join(entry.root, subfolder) : entry.root;
  ensureInside(entry.root, dir);
  fs.mkdirSync(dir, { recursive: true });

  const safeTitle = title.trim() || "New Note";
  const fullPath = uniqueNotePath(dir, safeTitle);
  const finalTitle = path.basename(fullPath, ".md");
  const finalContent =
    templateName !== undefined ? await renderNoteTemplate(entry.root, templateName, finalTitle, templateValues) : content;
  await fs.promises.writeFile(fullPath, finalContent, "utf-8");

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
  cliAccessFile: string,
  historyRoot: string | undefined,
  folderName: string,
  notePath: string,
  content: string,
  expectedMtimeMs?: number
): Promise<CliResult> {
  const entry = resolveFolder(readNotesFoldersFile(notesFoldersFile), cliAccessFile, folderName);
  const fullPath = path.join(entry.root, notePath);
  ensureInside(entry.root, fullPath);

  const created = !fs.existsSync(fullPath);
  // Nothing to conflict with (or snapshot) for a note that doesn't exist
  // yet - both only apply when overwriting.
  if (!created) {
    const conflict = checkExpectedMtime(fullPath, expectedMtimeMs);
    if (conflict) return conflict;
    if (historyRoot) recordSnapshot(historyRoot, entry.root, notePath, await fs.promises.readFile(fullPath, "utf-8"));
  }
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  await fs.promises.writeFile(fullPath, content, "utf-8");

  return {
    ok: true,
    folder: entry.name,
    note: notePath,
    created,
    mtimeMs: fs.statSync(fullPath).mtimeMs,
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
  cliAccessFile: string,
  historyRoot: string | undefined,
  folderName: string,
  notePath: string,
  additionalText: string,
  heading?: string,
  expectedMtimeMs?: number
): Promise<CliResult> {
  const entry = resolveFolder(readNotesFoldersFile(notesFoldersFile), cliAccessFile, folderName);
  const fullPath = path.join(entry.root, notePath);
  ensureInside(entry.root, fullPath);

  if (!fs.existsSync(fullPath)) {
    return { ok: false, message: `Note "${notePath}" does not exist in notes folder "${entry.name}".` };
  }

  const conflict = checkExpectedMtime(fullPath, expectedMtimeMs);
  if (conflict) return conflict;

  const existing = await fs.promises.readFile(fullPath, "utf-8");
  const content = heading !== undefined ? insertUnderHeading(existing, heading, additionalText) : appendText(existing, additionalText);
  if (content === null) {
    return { ok: false, message: `Heading "${heading}" was not found in note "${notePath}".` };
  }

  if (historyRoot) recordSnapshot(historyRoot, entry.root, notePath, existing);
  await fs.promises.writeFile(fullPath, content, "utf-8");
  return { ok: true, folder: entry.name, note: notePath, content, mtimeMs: fs.statSync(fullPath).mtimeMs };
}

export async function deleteNote(
  notesFoldersFile: string,
  cliAccessFile: string,
  historyRoot: string | undefined,
  folderName: string,
  notePath: string,
  expectedMtimeMs?: number
): Promise<CliResult> {
  const entry = resolveFolder(readNotesFoldersFile(notesFoldersFile), cliAccessFile, folderName);
  const fullPath = path.join(entry.root, notePath);
  ensureInside(entry.root, fullPath);

  if (!fs.existsSync(fullPath)) {
    return { ok: false, message: `Note "${notePath}" does not exist in notes folder "${entry.name}".` };
  }

  const conflict = checkExpectedMtime(fullPath, expectedMtimeMs);
  if (conflict) return conflict;

  // Snapshotting before delete (rather than relying on the throttle, which
  // is meant for autosave bursts) means restore_note_version can always
  // bring a deleted note back, even if it was just snapshotted minutes ago.
  if (historyRoot) recordSnapshot(historyRoot, entry.root, notePath, await fs.promises.readFile(fullPath, "utf-8"), { force: true });
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
  cliAccessFile: string,
  folderName: string,
  query: string,
  options: SearchNotesOptions
): Promise<CliResult> {
  const entry = resolveFolder(readNotesFoldersFile(notesFoldersFile), cliAccessFile, folderName);
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

export function getProperties(
  notesFoldersFile: string,
  cliAccessFile: string,
  folderName: string,
  notePath: string
): CliResult {
  const entry = resolveFolder(readNotesFoldersFile(notesFoldersFile), cliAccessFile, folderName);
  const fullPath = path.join(entry.root, notePath);
  ensureInside(entry.root, fullPath);

  if (!fs.existsSync(fullPath)) {
    return { ok: false, message: `Note "${notePath}" does not exist in notes folder "${entry.name}".` };
  }

  return {
    ok: true,
    folder: entry.name,
    note: notePath,
    properties: readNoteProperties(fullPath),
    mtimeMs: fs.statSync(fullPath).mtimeMs,
  };
}

// Merges `patch` into the note's existing frontmatter - a JSON Merge Patch
// (RFC 7396): keys not mentioned are left alone, and a key set to `null`
// removes that property instead of setting it. Validates against the
// notes folder's property schema if one exists, but (matching the GUI's
// Properties panel) validation is advisory only - an invalid value is
// still saved, just reported back as a warning.
export function setProperties(
  notesFoldersFile: string,
  cliAccessFile: string,
  folderName: string,
  notePath: string,
  patch: Record<string, unknown>,
  expectedMtimeMs?: number
): CliResult {
  const entry = resolveFolder(readNotesFoldersFile(notesFoldersFile), cliAccessFile, folderName);
  const fullPath = path.join(entry.root, notePath);
  ensureInside(entry.root, fullPath);

  if (!fs.existsSync(fullPath)) {
    return { ok: false, message: `Note "${notePath}" does not exist in notes folder "${entry.name}".` };
  }

  const conflict = checkExpectedMtime(fullPath, expectedMtimeMs);
  if (conflict) return conflict;

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
    mtimeMs: fs.statSync(fullPath).mtimeMs,
    ...(Object.keys(warnings).length > 0 ? { warnings } : {}),
  };
}

// Backlinks only, i.e. wikilinks/markdown links that resolve to this note's
// title (case-insensitively, same as the GUI's graph) - excludes notes that
// merely share a tag with it, which get_tags covers instead. Reuses
// shared/buildGraph.ts rather than re-implementing link resolution.
export async function getBacklinks(
  notesFoldersFile: string,
  cliAccessFile: string,
  folderName: string,
  notePath: string
): Promise<CliResult> {
  const entry = resolveFolder(readNotesFoldersFile(notesFoldersFile), cliAccessFile, folderName);
  const fullPath = path.join(entry.root, notePath);
  ensureInside(entry.root, fullPath);

  if (!fs.existsSync(fullPath)) {
    return { ok: false, message: `Note "${notePath}" does not exist in notes folder "${entry.name}".` };
  }

  const notes = await loadNotesFolder(entry.root);
  const graph = buildGraph(notes);
  const byLowerTitle = new Map(notes.map((n) => [n.title.toLowerCase(), n]));

  const backlinks = backlinkTitles(graph, titleFromPath(notePath))
    .map((title) => byLowerTitle.get(title.toLowerCase()))
    .filter((n): n is Note => n !== undefined)
    .map((n) => n.relativePath);

  return { ok: true, folder: entry.name, note: notePath, backlinks };
}

export async function getTags(notesFoldersFile: string, cliAccessFile: string, folderName: string): Promise<CliResult> {
  const entry = resolveFolder(readNotesFoldersFile(notesFoldersFile), cliAccessFile, folderName);
  const notes = await loadNotesFolder(entry.root);

  const notesByTag = new Map<string, string[]>();
  for (const note of notes) {
    for (const tag of note.tags) {
      const list = notesByTag.get(tag);
      if (list) list.push(note.relativePath);
      else notesByTag.set(tag, [note.relativePath]);
    }
  }

  const tags = Array.from(notesByTag.entries())
    .map(([tag, notesWithTag]) => ({ tag, notes: notesWithTag }))
    .sort((a, b) => a.tag.localeCompare(b.tag));

  return { ok: true, folder: entry.name, tags };
}

// Lists attachments (files under the notes folder's "attachments" folder,
// see electron/attachments.ts) that no note currently embeds via
// ![](path) - candidates for delete_orphaned_attachments.
export async function getOrphanedAttachments(
  notesFoldersFile: string,
  cliAccessFile: string,
  folderName: string
): Promise<CliResult> {
  const entry = resolveFolder(readNotesFoldersFile(notesFoldersFile), cliAccessFile, folderName);
  const notes = await loadNotesFolder(entry.root);
  return { ok: true, folder: entry.name, orphaned: findOrphanedAttachments(entry.root, notes) };
}

// Deletes every currently-orphaned attachment (recomputed fresh, not
// trusting a possibly-stale list from an earlier get_orphaned_attachments
// call) and reports what was removed.
export async function deleteOrphanedAttachments(
  notesFoldersFile: string,
  cliAccessFile: string,
  folderName: string
): Promise<CliResult> {
  const entry = resolveFolder(readNotesFoldersFile(notesFoldersFile), cliAccessFile, folderName);
  const notes = await loadNotesFolder(entry.root);
  const orphaned = findOrphanedAttachments(entry.root, notes);
  deleteAttachments(entry.root, orphaned);
  return { ok: true, folder: entry.name, deleted: orphaned };
}

// Only lists folders that have been granted CLI/MCP access - an agent's
// view of what notes folders exist should match what it can actually
// touch, same reasoning as gating every other operation through
// resolveFolder above.
export function listFolders(notesFoldersFile: string, cliAccessFile: string): CliResult {
  const notesFolders = readNotesFoldersFile(notesFoldersFile);
  const access = readCliAccessFile(cliAccessFile);
  const folders = notesFolders.filter((f) => isFolderAllowed(access, f.name)).map((f) => ({ name: f.name, root: f.root }));
  return { ok: true, folders };
}

// Lists the local snapshots recorded for a note (see noteHistory.ts) -
// newest first. A snapshot's timestamp is what restore_note_version expects.
export function getNoteHistory(
  notesFoldersFile: string,
  cliAccessFile: string,
  historyRoot: string,
  folderName: string,
  notePath: string
): CliResult {
  const entry = resolveFolder(readNotesFoldersFile(notesFoldersFile), cliAccessFile, folderName);
  return { ok: true, folder: entry.name, note: notePath, versions: listSnapshots(historyRoot, entry.root, notePath) };
}

// Overwrites a note with one of its recorded snapshots. The note's current
// content (if it still exists) is itself snapshotted first, bypassing the
// usual throttle, so restoring is never a one-way trip.
export async function restoreNoteVersion(
  notesFoldersFile: string,
  cliAccessFile: string,
  historyRoot: string,
  folderName: string,
  notePath: string,
  timestamp: string,
  expectedMtimeMs?: number
): Promise<CliResult> {
  const entry = resolveFolder(readNotesFoldersFile(notesFoldersFile), cliAccessFile, folderName);
  const fullPath = path.join(entry.root, notePath);
  ensureInside(entry.root, fullPath);

  const versionContent = readSnapshot(historyRoot, entry.root, notePath, timestamp);
  if (versionContent === null) {
    return { ok: false, message: `No history snapshot of "${notePath}" found at timestamp "${timestamp}".` };
  }

  if (fs.existsSync(fullPath)) {
    const conflict = checkExpectedMtime(fullPath, expectedMtimeMs);
    if (conflict) return conflict;
    recordSnapshot(historyRoot, entry.root, notePath, await fs.promises.readFile(fullPath, "utf-8"), { force: true });
  }

  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  await fs.promises.writeFile(fullPath, versionContent, "utf-8");

  return {
    ok: true,
    folder: entry.name,
    note: notePath,
    restoredFrom: timestamp,
    mtimeMs: fs.statSync(fullPath).mtimeMs,
    message: `Restored "${notePath}" to the version from ${timestamp}.`,
  };
}

export async function runCliCommand(
  args: string[],
  notesFoldersFile: string,
  cliAccessFile: string,
  historyRoot?: string,
  readStdin?: () => string
): Promise<CliResult> {
  const [command, ...rest] = args;
  const { positional, flags } = parseArgs(rest);

  switch (command) {
    case "add_folder": {
      const root = positional[0];
      if (!root) throw new Error("Usage: add_folder <path> [--name NAME]");
      return addFolder(notesFoldersFile, cliAccessFile, root, flagString(flags.name));
    }
    case "get_notes": {
      const folder = flagString(flags.folder);
      if (!folder) throw new Error("Usage: get_notes --folder NAME [--subfolders]");
      return getNotes(notesFoldersFile, cliAccessFile, folder, Boolean(flags.subfolders));
    }
    case "get_note": {
      const folder = flagString(flags.folder);
      const note = positional[0];
      if (!folder || !note) throw new Error("Usage: get_note --folder NAME <notePath>");
      return getNote(notesFoldersFile, cliAccessFile, folder, note);
    }
    case "add_note": {
      const usage =
        "add_note --folder NAME <title> [--subfolder PATH] " +
        "(--content TEXT | --content-file PATH|- | --template NAME [--values '{\"key\":\"value\"}'])";
      const folder = flagString(flags.folder);
      const title = positional[0];
      if (!folder || !title) throw new Error(`Usage: ${usage}`);
      const templateName = flagString(flags.template);
      const valuesJson = flagString(flags.values);
      if (templateName !== undefined && (flags.content !== undefined || flags["content-file"] !== undefined)) {
        throw new Error(`Specify either --content/--content-file or --template, not both. Usage: ${usage}`);
      }
      if (valuesJson !== undefined && templateName === undefined) {
        throw new Error(`--values requires --template. Usage: ${usage}`);
      }
      let templateValues: Record<string, string> | undefined;
      if (valuesJson !== undefined) {
        let parsed: unknown;
        try {
          parsed = JSON.parse(valuesJson);
        } catch {
          throw new Error(`--values must be valid JSON. Usage: ${usage}`);
        }
        if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
          throw new Error(`--values must be a JSON object. Usage: ${usage}`);
        }
        templateValues = parsed as Record<string, string>;
      }
      const content = resolveContentFlag(flags, usage, false, readStdin);
      return addNote(notesFoldersFile, cliAccessFile, folder, title, content, flagString(flags.subfolder), templateName, templateValues);
    }
    case "set_note": {
      const usage =
        "set_note --folder NAME <notePath> (--content TEXT | --content-file PATH|-) [--if-unmodified-since MTIME_MS]";
      const folder = flagString(flags.folder);
      const note = positional[0];
      if (!folder || !note) throw new Error(`Usage: ${usage}`);
      const content = resolveContentFlag(flags, usage, true, readStdin);
      return setNote(notesFoldersFile, cliAccessFile, historyRoot, folder, note, content, expectedMtimeFlag(flags, usage));
    }
    case "update_note": {
      const usage =
        "update_note --folder NAME <notePath> (--content TEXT | --content-file PATH|-) [--heading NAME] [--if-unmodified-since MTIME_MS]";
      const folder = flagString(flags.folder);
      const note = positional[0];
      if (!folder || !note) throw new Error(`Usage: ${usage}`);
      const content = resolveContentFlag(flags, usage, true, readStdin);
      return updateNote(
        notesFoldersFile,
        cliAccessFile,
        historyRoot,
        folder,
        note,
        content,
        flagString(flags.heading),
        expectedMtimeFlag(flags, usage)
      );
    }
    case "delete_note": {
      const usage = "delete_note --folder NAME <notePath> [--if-unmodified-since MTIME_MS]";
      const folder = flagString(flags.folder);
      const note = positional[0];
      if (!folder || !note) throw new Error(`Usage: ${usage}`);
      return deleteNote(notesFoldersFile, cliAccessFile, historyRoot, folder, note, expectedMtimeFlag(flags, usage));
    }
    case "search_notes": {
      const usage = "search_notes --folder NAME <query> [--regex] [--case-sensitive] [--whole-word]";
      const folder = flagString(flags.folder);
      const query = positional[0];
      if (!folder || !query) throw new Error(`Usage: ${usage}`);
      return searchNotes(notesFoldersFile, cliAccessFile, folder, query, {
        regex: Boolean(flags.regex),
        caseSensitive: Boolean(flags["case-sensitive"]),
        wholeWord: Boolean(flags["whole-word"]),
      });
    }
    case "get_properties": {
      const folder = flagString(flags.folder);
      const note = positional[0];
      if (!folder || !note) throw new Error("Usage: get_properties --folder NAME <notePath>");
      return getProperties(notesFoldersFile, cliAccessFile, folder, note);
    }
    case "set_properties": {
      const usage = `set_properties --folder NAME <notePath> --json '{"key":"value",...}' [--if-unmodified-since MTIME_MS]`;
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
      return setProperties(
        notesFoldersFile,
        cliAccessFile,
        folder,
        note,
        patch as Record<string, unknown>,
        expectedMtimeFlag(flags, usage)
      );
    }
    case "get_backlinks": {
      const folder = flagString(flags.folder);
      const note = positional[0];
      if (!folder || !note) throw new Error("Usage: get_backlinks --folder NAME <notePath>");
      return getBacklinks(notesFoldersFile, cliAccessFile, folder, note);
    }
    case "get_tags": {
      const folder = flagString(flags.folder);
      if (!folder) throw new Error("Usage: get_tags --folder NAME");
      return getTags(notesFoldersFile, cliAccessFile, folder);
    }
    case "list_folders":
      return listFolders(notesFoldersFile, cliAccessFile);
    case "get_note_history": {
      const folder = flagString(flags.folder);
      const note = positional[0];
      if (!folder || !note) throw new Error("Usage: get_note_history --folder NAME <notePath>");
      if (!historyRoot) throw new Error("History is not available in this context.");
      return getNoteHistory(notesFoldersFile, cliAccessFile, historyRoot, folder, note);
    }
    case "restore_note_version": {
      const usage = "restore_note_version --folder NAME <notePath> --timestamp ISO_TIMESTAMP [--if-unmodified-since MTIME_MS]";
      const folder = flagString(flags.folder);
      const note = positional[0];
      const timestamp = flagString(flags.timestamp);
      if (!folder || !note || !timestamp) throw new Error(`Usage: ${usage}`);
      if (!historyRoot) throw new Error("History is not available in this context.");
      return restoreNoteVersion(notesFoldersFile, cliAccessFile, historyRoot, folder, note, timestamp, expectedMtimeFlag(flags, usage));
    }
    case "get_orphaned_attachments": {
      const folder = flagString(flags.folder);
      if (!folder) throw new Error("Usage: get_orphaned_attachments --folder NAME");
      return getOrphanedAttachments(notesFoldersFile, cliAccessFile, folder);
    }
    case "delete_orphaned_attachments": {
      const folder = flagString(flags.folder);
      if (!folder) throw new Error("Usage: delete_orphaned_attachments --folder NAME");
      return deleteOrphanedAttachments(notesFoldersFile, cliAccessFile, folder);
    }
    default:
      throw new Error(`Unknown command "${command}"`);
  }
}
