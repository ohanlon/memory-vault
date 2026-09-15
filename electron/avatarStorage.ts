import fs from "node:fs";
import path from "node:path";
import type { AvatarEntityKind } from "../shared/avatars";
import type { CustomAvatarRef } from "../shared/types";

const ALLOWED_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp"]);

/** Per-entity avatar folder in userData, keyed directly by the entry's
 *  current display name — same convention as cairnWorkspaceStateFilePath in
 *  workspaceState.ts. Avatar data lives here (not inside the user's vault)
 *  since it's app-owned, not part of the user's notes. */
export function avatarDirPath(userDataDir: string, kind: AvatarEntityKind, name: string): string {
  return path.join(userDataDir, kind === "stack" ? "stacks" : "cairns", name, "avatar");
}

/** Copies `sourceFilePath` (as returned by the OS file picker) into this
 *  entry's avatar folder, replacing any previously-stored custom avatar
 *  (including one with a different extension). Returns the AvatarRef to
 *  persist on the entry. Throws on an unsupported file extension. */
export function writeCustomAvatar(
  userDataDir: string,
  kind: AvatarEntityKind,
  name: string,
  sourceFilePath: string
): CustomAvatarRef {
  const ext = path.extname(sourceFilePath).toLowerCase();
  if (!ALLOWED_EXTENSIONS.has(ext)) {
    throw new Error(`Unsupported image type "${ext || "(none)"}"`);
  }
  const dir = avatarDirPath(userDataDir, kind, name);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const fileName = `avatar${ext}`;
  fs.copyFileSync(sourceFilePath, path.join(dir, fileName));
  return { kind: "custom", fileName, updatedAt: Date.now() };
}

/** Deletes this entry's entire avatar folder — used both for an explicit
 *  "Reset avatar" and when the Stack/Cairn itself is removed. No-op if it
 *  never existed. */
export function removeCustomAvatar(userDataDir: string, kind: AvatarEntityKind, name: string): void {
  fs.rmSync(avatarDirPath(userDataDir, kind, name), { recursive: true, force: true });
}

/** Moves the avatar folder when the entry is renamed, so a custom avatar
 *  survives the rename. No-op if the entry never had a custom avatar, or if
 *  old/new names are case-insensitively equal (no folder move needed). */
export function renameAvatarFolder(
  userDataDir: string,
  kind: AvatarEntityKind,
  oldName: string,
  newName: string
): void {
  if (oldName.toLowerCase() === newName.toLowerCase()) return;
  const oldDir = avatarDirPath(userDataDir, kind, oldName);
  if (!fs.existsSync(oldDir)) return;
  const newDir = avatarDirPath(userDataDir, kind, newName);
  fs.rmSync(newDir, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(newDir), { recursive: true });
  fs.renameSync(oldDir, newDir);
}
