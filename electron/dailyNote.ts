import fs from "node:fs";
import path from "node:path";
import { DAILY_NOTES_FOLDER } from "../shared/dailyNote";
import { formatDateWithPattern } from "../shared/dateFormat";
import type { DailyNoteResult } from "../shared/types";

// Replaces characters invalid in a filename on at least one major OS with
// "-", so a dateFormat pattern containing e.g. a time separator (":")
// can't turn into a broken/nested path.
function sanitizeFilenamePart(s: string): string {
  return s.replace(/[\\/:*?"<>|]/g, "-");
}

/** Opens today's daily note, creating it (and its folder) on first use. */
export function openOrCreateDailyNote(root: string, dateFormat: string, now: Date): DailyNoteResult {
  const folderAbs = path.join(root, DAILY_NOTES_FOLDER);
  const formatted = formatDateWithPattern(now, dateFormat);
  const fileName = `${sanitizeFilenamePart(formatted)}.md`;
  const fullPath = path.join(folderAbs, fileName);

  if (fs.existsSync(fullPath)) {
    return { path: fullPath, created: false };
  }

  fs.mkdirSync(folderAbs, { recursive: true });
  const scaffold = `---\ntags: []\n---\n\n# ${formatted}\n`;
  fs.writeFileSync(fullPath, scaffold, "utf-8");
  return { path: fullPath, created: true };
}
