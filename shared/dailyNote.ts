/** Fixed, stack-relative folder every daily note is created in — not user-configurable. */
export const DAILY_NOTES_FOLDER = "daily";

/** True if `relativePath` (a note's path relative to its stack root) lives under the daily-notes folder. */
export function isDailyNote(relativePath: string): boolean {
  return relativePath.split(/[\\/]/)[0] === DAILY_NOTES_FOLDER;
}
