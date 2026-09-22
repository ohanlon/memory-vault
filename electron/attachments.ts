import fs from "node:fs";
import path from "node:path";
import { ATTACHMENTS_DIRNAME, resolveRelativeAttachmentPath } from "../shared/attachmentPath";
import { extractImageEmbeds } from "../shared/parseNote";
import type { Note } from "../shared/types";

// dir/name.ext, or dir/name 2.ext, dir/name 3.ext, ... incrementing past
// whatever already exists - mirrors notesFolder.ts's uniqueNotePath for a
// non-.md file.
function uniqueAttachmentPath(dir: string, fileName: string): string {
  const ext = path.extname(fileName);
  const base = path.basename(fileName, ext);
  let candidate = fileName;
  let n = 0;
  while (fs.existsSync(path.join(dir, candidate))) {
    n += 1;
    candidate = `${base} ${n}${ext}`;
  }
  return path.join(dir, candidate);
}

// Saves `data` under a single top-level "attachments" folder at the notes
// folder root (created if missing), auto-renaming on a name collision
// rather than overwriting. Returns the saved file's path relative to root
// (posix-separated, for embedding in markdown via shared/attachmentPath.ts).
export function saveAttachment(root: string, fileName: string, data: Buffer): string {
  const dir = path.join(root, ATTACHMENTS_DIRNAME);
  fs.mkdirSync(dir, { recursive: true });
  const fullPath = uniqueAttachmentPath(dir, fileName);
  fs.writeFileSync(fullPath, data);
  return path.relative(root, fullPath).replace(/\\/g, "/");
}

function walkAttachmentFiles(root: string, dir: string, out: string[]): void {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walkAttachmentFiles(root, full, out);
    else if (entry.isFile()) out.push(path.relative(root, full).replace(/\\/g, "/"));
  }
}

/** Every file under root's attachments folder, as a path relative to root (posix-separated). */
function listAttachmentFiles(root: string): string[] {
  const out: string[] = [];
  walkAttachmentFiles(root, path.join(root, ATTACHMENTS_DIRNAME), out);
  return out;
}

// Every attachment file not referenced by an image embed (![](...)) in any
// given note - scans each note's raw body for embeds, resolves each one
// against that note's own location (shared/attachmentPath.ts, same
// resolution MarkdownPreview.tsx uses to render them), and reports whatever
// is left over in the attachments folder. A reference from a schema this
// doesn't recognize (e.g. an external URL) simply doesn't count either way.
export function findOrphanedAttachments(root: string, notes: Note[]): string[] {
  const referenced = new Set<string>();
  for (const note of notes) {
    for (const href of extractImageEmbeds(note.content)) {
      const resolved = resolveRelativeAttachmentPath(note.relativePath, href);
      if (resolved) referenced.add(resolved);
    }
  }
  return listAttachmentFiles(root).filter((relPath) => !referenced.has(relPath));
}

// Deletes the given root-relative attachment paths (as returned by
// findOrphanedAttachments), skipping any that don't exist rather than
// throwing - the caller may be re-running this against a slightly stale
// list. Silently ignores a path that would escape root, the same
// containment rule every other note/attachment path in this app follows.
export function deleteAttachments(root: string, relativePaths: string[]): void {
  const resolvedRoot = path.resolve(root);
  for (const relPath of relativePaths) {
    const fullPath = path.resolve(resolvedRoot, relPath);
    const rel = path.relative(resolvedRoot, fullPath);
    if (rel.startsWith("..") || path.isAbsolute(rel)) continue;
    fs.rmSync(fullPath, { force: true });
  }
}
