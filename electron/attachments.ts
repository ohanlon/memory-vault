import fs from "node:fs";
import path from "node:path";
import { ATTACHMENTS_DIRNAME } from "../shared/attachmentPath";

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
