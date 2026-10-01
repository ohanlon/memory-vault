import type { Note } from "./types";

export type TaskStatus = "todo" | "in-progress" | "done";

export interface Task {
  /** Absolute path of the note this task line lives in. */
  notePath: string;
  noteTitle: string;
  /** 0-based index into the note's body (Note.content) lines — used to write status changes back to the exact line. */
  lineNumber: number;
  text: string;
  status: TaskStatus;
  /** ISO "YYYY-MM-DD", or null if the task has no deadline. */
  deadline: string | null;
}

// "- [ ] text", "- [/] text" (in progress), "- [x] text" (done) — the same
// checkbox syntax common markdown renders as a checklist, extended with "/"
// for a third state plain GFM checkboxes don't have.
const TASK_LINE_RE = /^(\s*)-\s\[([ xX/])\]\s+(.*)$/;
const FENCE_RE = /^\s*(```|~~~)/;
// A trailing "(due: YYYY-MM-DD)" token, stripped from the displayed text.
const DUE_RE = /\s*\(due:\s*(\d{4}-\d{2}-\d{2})\)\s*$/;

function statusFromMarker(marker: string): TaskStatus {
  if (marker === "/") return "in-progress";
  if (marker.toLowerCase() === "x") return "done";
  return "todo";
}

function markerFromStatus(status: TaskStatus): string {
  if (status === "in-progress") return "/";
  if (status === "done") return "x";
  return " ";
}

/** Every task checkbox line in a note's body, skipping fenced code blocks so an example checkbox in a code sample isn't picked up. */
export function parseTasksFromNote(note: Note): Task[] {
  const tasks: Task[] = [];
  let inFence = false;
  note.content.split("\n").forEach((line, lineNumber) => {
    if (FENCE_RE.test(line)) {
      inFence = !inFence;
      return;
    }
    if (inFence) return;
    const m = TASK_LINE_RE.exec(line);
    if (!m) return;
    let text = m[3];
    let deadline: string | null = null;
    const dueMatch = DUE_RE.exec(text);
    if (dueMatch) {
      deadline = dueMatch[1];
      text = text.slice(0, dueMatch.index).trimEnd();
    }
    tasks.push({
      notePath: note.path,
      noteTitle: note.title,
      lineNumber,
      text,
      status: statusFromMarker(m[2]),
      deadline,
    });
  });
  return tasks;
}

/** Every task across every note. */
export function collectTasks(notes: Note[]): Task[] {
  return notes.flatMap(parseTasksFromNote);
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

/** Renders a task as its markdown checkbox line, e.g. "- [ ] Buy milk (due: 2026-10-05)". */
export function formatTaskLine(text: string, status: TaskStatus, deadline: string | null): string {
  const due = deadline ? ` (due: ${deadline})` : "";
  return `- [${markerFromStatus(status)}] ${text.trim()}${due}`;
}

/** Appends a new task line to a note's body, adding a trailing newline first if the body doesn't already end with one. */
export function appendTaskToContent(content: string, text: string, status: TaskStatus, deadline: string | null): string {
  const line = formatTaskLine(text, status, deadline);
  if (content.length === 0) return `${line}\n`;
  return `${content}${content.endsWith("\n") ? "" : "\n"}${line}\n`;
}

/** Rewrites just the checkbox marker on `lineNumber`, leaving the task's text/deadline untouched. No-op if that line isn't a task line any more (e.g. edited concurrently). */
export function setTaskStatusInContent(content: string, lineNumber: number, status: TaskStatus): string {
  const lines = content.split("\n");
  const line = lines[lineNumber];
  if (line === undefined) return content;
  const m = TASK_LINE_RE.exec(line);
  if (!m) return content;
  lines[lineNumber] = `${m[1]}- [${markerFromStatus(status)}] ${m[3]}`;
  return lines.join("\n");
}
