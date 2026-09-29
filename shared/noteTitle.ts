// A "/" or "\" here would let a title escape its own directory once ".md"
// is appended (e.g. "../../etc/passwd"), so it's rejected alongside the
// other characters Windows (the most restrictive of the platforms Cairn
// runs on) disallows in a filename.
const INVALID_TITLE_CHARS = /[\\/:*?"<>|\x00-\x1f]/;

/** Returns an error message if `title` (expected to already be trimmed) can't be used as a note/folder filename, or null if it's fine. */
export function invalidTitleReason(title: string): string | null {
  if (!title) return "Name cannot be empty";
  if (INVALID_TITLE_CHARS.test(title)) return 'Name cannot contain any of: \\ / : * ? " < > |';
  return null;
}
