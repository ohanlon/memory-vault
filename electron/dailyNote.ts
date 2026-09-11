import fs from "node:fs";
import path from "node:path";
import { DAILY_NOTES_FOLDER, formatDailyNoteFilename, formatDailyNoteHeading } from "../shared/dailyNote";
import type { DailyNoteResult } from "../shared/types";

/** Opens today's daily note, creating it (and its folder) on first use. */
export function openOrCreateDailyNote(root: string, locale: string, now: Date): DailyNoteResult {
  const folderAbs = path.join(root, DAILY_NOTES_FOLDER);
  const fileName = `${formatDailyNoteFilename(now, locale)}.md`;
  const fullPath = path.join(folderAbs, fileName);

  if (fs.existsSync(fullPath)) {
    return { path: fullPath, created: false };
  }

  fs.mkdirSync(folderAbs, { recursive: true });
  const heading = formatDailyNoteHeading(now, locale);
  const scaffold = `---\ntags: []\n---\n\n# ${heading}\n`;
  fs.writeFileSync(fullPath, scaffold, "utf-8");
  return { path: fullPath, created: true };
}
