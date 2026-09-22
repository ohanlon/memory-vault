import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

// Local version history for notes, stored outside any notes folder (under
// the app's userData dir, alongside notesFolders.json/cli-access.json) so it
// never shows up as a stray file inside a folder a user might sync/commit
// elsewhere. Snapshots are plain timestamped .md files, keyed by a hash of
// the notes folder's root path (stable across a GUI rename, and works for a
// folder that was never registered in notesFolders.json at all) plus the
// note's path relative to that root.

const DEFAULT_MIN_INTERVAL_MS = 10 * 60 * 1000; // don't snapshot more than once per 10 minutes per note
const DEFAULT_MAX_SNAPSHOTS = 50; // per note, oldest pruned first

function folderKey(folderRoot: string): string {
  const resolved = path.resolve(folderRoot);
  const normalized = process.platform === "win32" ? resolved.toLowerCase() : resolved;
  return crypto.createHash("sha1").update(normalized).digest("hex").slice(0, 16);
}

function snapshotDir(historyRoot: string, folderRoot: string, notePath: string): string {
  return path.join(historyRoot, folderKey(folderRoot), notePath);
}

// ISO 8601 with ":"/"." swapped for "-" so it's a valid filename on Windows,
// still lexically sortable in chronological order since the format is fixed
// width (e.g. "2026-09-22T10-15-30-123Z.md").
function timestampToFileName(date: Date): string {
  return `${date.toISOString().replace(/[:.]/g, "-")}.md`;
}

function fileNameToTimestamp(fileName: string): string {
  const base = fileName.replace(/\.md$/, "");
  return base.replace(/T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z$/, "T$1:$2:$3.$4Z");
}

function listSnapshotFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".md"))
    .sort();
}

export interface RecordSnapshotOptions {
  minIntervalMs?: number;
  maxSnapshots?: number;
  now?: Date;
  // Bypasses the min-interval throttle - for an explicit checkpoint (e.g.
  // right before a restore) that should always be recorded.
  force?: boolean;
}

// Records `content` as a new timestamped snapshot for a note. Throttled by
// default so a burst of autosaves while typing doesn't create one snapshot
// per keystroke: skipped unless the most recent snapshot for this note is
// older than minIntervalMs (or there isn't one yet).
export function recordSnapshot(
  historyRoot: string,
  folderRoot: string,
  notePath: string,
  content: string,
  options?: RecordSnapshotOptions
): void {
  const minIntervalMs = options?.minIntervalMs ?? DEFAULT_MIN_INTERVAL_MS;
  const maxSnapshots = options?.maxSnapshots ?? DEFAULT_MAX_SNAPSHOTS;
  const now = options?.now ?? new Date();

  const dir = snapshotDir(historyRoot, folderRoot, notePath);
  const existing = listSnapshotFiles(dir);

  if (!options?.force && existing.length > 0) {
    const lastTimestamp = Date.parse(fileNameToTimestamp(existing[existing.length - 1]));
    if (now.getTime() - lastTimestamp < minIntervalMs) return;
  }

  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, timestampToFileName(now)), content, "utf-8");

  const updated = listSnapshotFiles(dir);
  const excess = updated.length - maxSnapshots;
  for (let i = 0; i < excess; i++) {
    fs.rmSync(path.join(dir, updated[i]), { force: true });
  }
}

export interface NoteHistoryEntry {
  timestamp: string; // ISO 8601
}

// Newest first.
export function listSnapshots(historyRoot: string, folderRoot: string, notePath: string): NoteHistoryEntry[] {
  const dir = snapshotDir(historyRoot, folderRoot, notePath);
  return listSnapshotFiles(dir)
    .map((f) => ({ timestamp: fileNameToTimestamp(f) }))
    .reverse();
}

export function readSnapshot(historyRoot: string, folderRoot: string, notePath: string, timestamp: string): string | null {
  const dir = snapshotDir(historyRoot, folderRoot, notePath);
  const parsed = new Date(timestamp);
  if (Number.isNaN(parsed.getTime())) return null;
  const fullPath = path.join(dir, timestampToFileName(parsed));
  if (!fs.existsSync(fullPath)) return null;
  return fs.readFileSync(fullPath, "utf-8");
}
