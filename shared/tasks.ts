import type { Note } from "./types";

export type TaskStatus = "todo" | "in-progress" | "done";

export const TASK_STATUSES: TaskStatus[] = ["todo", "in-progress", "done"];

/** Name given to the top-level folder tasks live in when the user hasn't made one themselves. */
export const TASKS_FOLDER_NAME = "Tasks";

export interface Task {
  /** Absolute path of the task's own note. */
  notePath: string;
  /** The task's action — the note's title. */
  text: string;
  status: TaskStatus;
  /** ISO "YYYY-MM-DD" from the note's `deadline` property, or null if it has none. */
  deadline: string | null;
}

/** A task is any note under the top-level tasks folder (matched case-insensitively, since the user may have made it by hand). */
export function isTaskNote(note: Pick<Note, "relativePath">): boolean {
  const segments = note.relativePath.replace(/\\/g, "/").split("/");
  return segments.length > 1 && segments[0].toLowerCase() === TASKS_FOLDER_NAME.toLowerCase();
}

function normalizeStatus(value: unknown): TaskStatus {
  return TASK_STATUSES.includes(value as TaskStatus) ? (value as TaskStatus) : "todo";
}

// An unquoted `deadline: 2026-10-05` is parsed by YAML as a Date (UTC
// midnight), and a Date that has been through the notes folder cache's JSON
// comes back as a full ISO timestamp string — both reduce to the date part.
function normalizeDeadline(value: unknown): string | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString().slice(0, 10);
  if (typeof value === "string") {
    const m = /^(\d{4}-\d{2}-\d{2})/.exec(value.trim());
    return m ? m[1] : null;
  }
  return null;
}

export function taskFromNote(note: Note): Task {
  return {
    notePath: note.path,
    text: note.title,
    status: normalizeStatus(note.frontmatter.status),
    deadline: normalizeDeadline(note.frontmatter.deadline),
  };
}

/** Every task note across the notes folder. */
export function collectTasks(notes: Note[]): Task[] {
  return notes.filter(isTaskNote).map(taskFromNote);
}

const STATUS_ORDER: Record<TaskStatus, number> = { "in-progress": 0, todo: 1, done: 2 };

/** Groups by status (in progress, then to do, then completed), soonest deadline first within a group, undated tasks last. */
export function sortTasksForDisplay(tasks: Task[]): Task[] {
  return [...tasks].sort((a, b) => {
    if (STATUS_ORDER[a.status] !== STATUS_ORDER[b.status]) return STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
    if (a.deadline !== b.deadline) {
      if (a.deadline === null) return 1;
      if (b.deadline === null) return -1;
      return a.deadline < b.deadline ? -1 : 1;
    }
    return a.text.localeCompare(b.text);
  });
}

export function isOutstanding(task: Task): boolean {
  return task.status !== "done";
}

/** True for an outstanding task whose deadline has already passed as of `todayIso`. */
export function isOverdue(task: Task, todayIso: string): boolean {
  return isOutstanding(task) && task.deadline !== null && task.deadline < todayIso;
}

/** Today's date as "YYYY-MM-DD" in local time. */
export function todayIsoDate(now: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}
