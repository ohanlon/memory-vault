// Turns a user-typed notes folder name into a single safe directory name, so
// a managed folder can live at `<notesRoot>/<dir>` on any platform (including
// case-insensitive filesystems and Windows' reserved device names).
const ILLEGAL_CHARS = /[<>:"/\\|?*\u0000-\u001f]/g;
const WINDOWS_RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

export function sanitizeDirName(name: string): string {
  const cleaned = name
    .replace(ILLEGAL_CHARS, "-")
    .trim()
    .replace(/^\.+/, "") // no ".", "..", or hidden folders
    .replace(/[. ]+$/, ""); // Windows strips trailing dots/spaces
  if (!cleaned || WINDOWS_RESERVED.test(cleaned.split(".")[0])) return "Untitled";
  return cleaned;
}

/** `base`, or `base-2`, `base-3`... — the first one `isTaken` doesn't claim (compared case-insensitively). */
export function uniqueDirName(base: string, isTaken: (candidate: string) => boolean): string {
  let candidate = base;
  for (let n = 2; isTaken(candidate); n++) candidate = `${base}-${n}`;
  return candidate;
}
