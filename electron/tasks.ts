import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import { TASKS_FOLDER_NAME, TASK_STATUSES, type TaskStatus } from "../shared/tasks";
import { uniqueNotePath } from "./notesFolder";

const MAX_FILE_TITLE_LENGTH = 80;

/** The existing top-level tasks folder under root (matched case-insensitively, so one the user made by hand is reused), or where a new one would go. */
export function resolveTasksFolder(root: string): string {
  const existing = fs
    .readdirSync(root, { withFileTypes: true })
    .find((e) => e.isDirectory() && e.name.toLowerCase() === TASKS_FOLDER_NAME.toLowerCase());
  return path.join(root, existing?.name ?? TASKS_FOLDER_NAME);
}

// The action text becomes the note's file name, so characters invalid in a
// filename on any supported OS are swapped for "-" rather than rejecting a
// task the user has already typed out.
function fileTitleFor(text: string): string {
  const cleaned = text
    .replace(/[\\/:*?"<>|\x00-\x1f]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_FILE_TITLE_LENGTH)
    .replace(/[. ]+$/, "");
  return cleaned || "Task";
}

/** Creates a task as its own note in the tasks folder (made if missing), with status/deadline as frontmatter properties. Returns the new note's path. */
export function createTaskNote(root: string, text: string, deadline: string | null, status: TaskStatus): string {
  const action = text.trim();
  if (!action) throw new Error("A task needs an action");
  if (!TASK_STATUSES.includes(status)) throw new Error(`Unknown task status "${status}"`);
  if (deadline !== null && !/^\d{4}-\d{2}-\d{2}$/.test(deadline)) throw new Error(`Invalid deadline "${deadline}"`);

  const dir = resolveTasksFolder(root);
  fs.mkdirSync(dir, { recursive: true });
  const fullPath = uniqueNotePath(dir, fileTitleFor(action));
  const properties: Record<string, unknown> = deadline ? { status, deadline } : { status };
  fs.writeFileSync(fullPath, matter.stringify(`# ${action}\n`, properties), "utf-8");
  return fullPath;
}
