import { describe, expect, it } from "vitest";
import {
  collectTasks,
  isOutstanding,
  isOverdue,
  isTaskNote,
  sortTasksForDisplay,
  taskFromNote,
  todayIsoDate,
} from "./tasks";
import type { Note } from "./types";

function note(relativePath: string, frontmatter: Record<string, unknown> = {}): Note {
  const title = relativePath.split(/[\\/]/).pop()!.replace(/\.md$/i, "");
  return {
    path: `/vault/${relativePath}`,
    title,
    relativePath,
    frontmatter,
    tags: [],
    links: [],
    content: "",
    mtimeMs: 0,
  };
}

describe("isTaskNote", () => {
  it("is true for a note directly in the Tasks folder", () => {
    expect(isTaskNote(note("Tasks/Buy milk.md"))).toBe(true);
  });

  it("matches the folder name case-insensitively, since the user may have created it by hand", () => {
    expect(isTaskNote(note("tasks/Buy milk.md"))).toBe(true);
  });

  it("is true for a note in a subfolder of Tasks, with either path separator", () => {
    expect(isTaskNote(note("Tasks/Work/Buy milk.md"))).toBe(true);
    expect(isTaskNote(note("Tasks\\Work\\Buy milk.md"))).toBe(true);
  });

  it("is false for notes elsewhere, including a nested folder merely named Tasks", () => {
    expect(isTaskNote(note("Buy milk.md"))).toBe(false);
    expect(isTaskNote(note("Projects/Tasks/Buy milk.md"))).toBe(false);
    expect(isTaskNote(note("Tasks.md"))).toBe(false);
  });
});

describe("taskFromNote", () => {
  it("uses the title as the action and reads status and deadline from frontmatter", () => {
    expect(taskFromNote(note("Tasks/Buy milk.md", { status: "in-progress", deadline: "2026-10-05" }))).toEqual({
      notePath: "/vault/Tasks/Buy milk.md",
      text: "Buy milk",
      status: "in-progress",
      deadline: "2026-10-05",
    });
  });

  it("defaults to to-do with no deadline when the properties are missing", () => {
    const task = taskFromNote(note("Tasks/Buy milk.md"));
    expect(task.status).toBe("todo");
    expect(task.deadline).toBeNull();
  });

  it("falls back to to-do for an unrecognised status", () => {
    expect(taskFromNote(note("Tasks/A.md", { status: "someday" })).status).toBe("todo");
  });

  it("accepts a deadline YAML parsed into a Date", () => {
    expect(taskFromNote(note("Tasks/A.md", { deadline: new Date("2026-10-05T00:00:00.000Z") })).deadline).toBe(
      "2026-10-05"
    );
  });

  it("accepts a deadline that went through the JSON cache as a full timestamp", () => {
    expect(taskFromNote(note("Tasks/A.md", { deadline: "2026-10-05T00:00:00.000Z" })).deadline).toBe("2026-10-05");
  });

  it("ignores a deadline that isn't a date", () => {
    expect(taskFromNote(note("Tasks/A.md", { deadline: "next week" })).deadline).toBeNull();
    expect(taskFromNote(note("Tasks/A.md", { deadline: 42 })).deadline).toBeNull();
  });
});

describe("collectTasks", () => {
  it("includes only notes in the Tasks folder", () => {
    const tasks = collectTasks([note("Tasks/A.md"), note("Other.md"), note("tasks/B.md")]);
    expect(tasks.map((t) => t.text)).toEqual(["A", "B"]);
  });
});

describe("sortTasksForDisplay", () => {
  it("orders in-progress, then to-do, then done", () => {
    const tasks = collectTasks([
      note("Tasks/done.md", { status: "done" }),
      note("Tasks/todo.md", { status: "todo" }),
      note("Tasks/wip.md", { status: "in-progress" }),
    ]);
    expect(sortTasksForDisplay(tasks).map((t) => t.status)).toEqual(["in-progress", "todo", "done"]);
  });

  it("sorts by soonest deadline within a status, undated last", () => {
    const tasks = collectTasks([
      note("Tasks/no date.md"),
      note("Tasks/later.md", { deadline: "2026-12-01" }),
      note("Tasks/sooner.md", { deadline: "2026-10-01" }),
    ]);
    expect(sortTasksForDisplay(tasks).map((t) => t.text)).toEqual(["sooner", "later", "no date"]);
  });
});

describe("isOutstanding / isOverdue", () => {
  it("treats todo and in-progress as outstanding, done as not", () => {
    const [todo, wip, done] = collectTasks([
      note("Tasks/a.md", { status: "todo" }),
      note("Tasks/b.md", { status: "in-progress" }),
      note("Tasks/c.md", { status: "done" }),
    ]);
    expect(isOutstanding(todo)).toBe(true);
    expect(isOutstanding(wip)).toBe(true);
    expect(isOutstanding(done)).toBe(false);
  });

  it("is overdue only when outstanding and past the given date", () => {
    const [pastDue, futureDue, doneAndPastDue] = collectTasks([
      note("Tasks/a.md", { deadline: "2026-01-01" }),
      note("Tasks/b.md", { deadline: "2099-01-01" }),
      note("Tasks/c.md", { status: "done", deadline: "2026-01-01" }),
    ]);
    expect(isOverdue(pastDue, "2026-06-01")).toBe(true);
    expect(isOverdue(futureDue, "2026-06-01")).toBe(false);
    expect(isOverdue(doneAndPastDue, "2026-06-01")).toBe(false);
  });
});

describe("todayIsoDate", () => {
  it("formats as YYYY-MM-DD", () => {
    expect(todayIsoDate(new Date(2026, 0, 5))).toBe("2026-01-05");
  });
});
