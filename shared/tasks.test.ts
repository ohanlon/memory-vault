import { describe, expect, it } from "vitest";
import {
  appendTaskToContent,
  collectTasks,
  formatTaskLine,
  isOutstanding,
  isOverdue,
  parseTasksFromNote,
  setTaskStatusInContent,
  sortTasksForDisplay,
  todayIsoDate,
} from "./tasks";
import type { Note } from "./types";

function note(content: string, overrides: Partial<Note> = {}): Note {
  return {
    path: "/vault/Note.md",
    title: "Note",
    relativePath: "Note.md",
    frontmatter: {},
    tags: [],
    links: [],
    content,
    mtimeMs: 0,
    ...overrides,
  };
}

describe("parseTasksFromNote", () => {
  it("parses a to-do checkbox", () => {
    const tasks = parseTasksFromNote(note("- [ ] Buy milk"));
    expect(tasks).toEqual([
      { notePath: "/vault/Note.md", noteTitle: "Note", lineNumber: 0, text: "Buy milk", status: "todo", deadline: null },
    ]);
  });

  it("parses in-progress and done markers", () => {
    const tasks = parseTasksFromNote(note("- [/] Draft\n- [x] Shipped\n- [X] Also shipped"));
    expect(tasks.map((t) => t.status)).toEqual(["in-progress", "done", "done"]);
  });

  it("extracts a trailing due-date token and strips it from the text", () => {
    const tasks = parseTasksFromNote(note("- [ ] Buy milk (due: 2026-10-05)"));
    expect(tasks[0].text).toBe("Buy milk");
    expect(tasks[0].deadline).toBe("2026-10-05");
  });

  it("ignores checkbox-like lines inside a fenced code block", () => {
    const tasks = parseTasksFromNote(note("```\n- [ ] not a real task\n```\n- [ ] real task"));
    expect(tasks).toHaveLength(1);
    expect(tasks[0].text).toBe("real task");
  });

  it("ignores a plain list item with no checkbox", () => {
    expect(parseTasksFromNote(note("- just a bullet"))).toHaveLength(0);
  });

  it("preserves indentation as part of the line but not the returned text", () => {
    const tasks = parseTasksFromNote(note("  - [ ] Nested task"));
    expect(tasks[0].text).toBe("Nested task");
  });
});

describe("collectTasks", () => {
  it("flattens tasks across multiple notes", () => {
    const notes = [
      note("- [ ] A", { path: "/vault/A.md", title: "A" }),
      note("- [x] B", { path: "/vault/B.md", title: "B" }),
    ];
    expect(collectTasks(notes).map((t) => t.text)).toEqual(["A", "B"]);
  });
});

describe("sortTasksForDisplay", () => {
  it("orders in-progress, then to-do, then done", () => {
    const tasks = collectTasks([
      note("- [x] done task\n- [ ] todo task\n- [/] wip task"),
    ]);
    expect(sortTasksForDisplay(tasks).map((t) => t.status)).toEqual(["in-progress", "todo", "done"]);
  });

  it("sorts by soonest deadline within a status, undated last", () => {
    const tasks = collectTasks([
      note("- [ ] no date\n- [ ] later (due: 2026-12-01)\n- [ ] sooner (due: 2026-10-01)"),
    ]);
    expect(sortTasksForDisplay(tasks).map((t) => t.text)).toEqual(["sooner", "later", "no date"]);
  });
});

describe("isOutstanding / isOverdue", () => {
  it("treats todo and in-progress as outstanding, done as not", () => {
    const [todo, wip, done] = collectTasks([note("- [ ] a\n- [/] b\n- [x] c")]);
    expect(isOutstanding(todo)).toBe(true);
    expect(isOutstanding(wip)).toBe(true);
    expect(isOutstanding(done)).toBe(false);
  });

  it("is overdue only when outstanding and past the given date", () => {
    const [pastDue, futureDue, doneAndPastDue] = collectTasks([
      note("- [ ] a (due: 2026-01-01)\n- [ ] b (due: 2099-01-01)\n- [x] c (due: 2026-01-01)"),
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

describe("formatTaskLine", () => {
  it("renders a plain to-do line", () => {
    expect(formatTaskLine("Buy milk", "todo", null)).toBe("- [ ] Buy milk");
  });

  it("renders in-progress and done markers with a due date", () => {
    expect(formatTaskLine("Draft", "in-progress", "2026-10-05")).toBe("- [/] Draft (due: 2026-10-05)");
    expect(formatTaskLine("Ship", "done", null)).toBe("- [x] Ship");
  });
});

describe("appendTaskToContent", () => {
  it("appends to empty content", () => {
    expect(appendTaskToContent("", "Buy milk", "todo", null)).toBe("- [ ] Buy milk\n");
  });

  it("adds a newline before the task if the content doesn't already end with one", () => {
    expect(appendTaskToContent("# Notes", "Buy milk", "todo", null)).toBe("# Notes\n- [ ] Buy milk\n");
  });

  it("doesn't double up a trailing newline", () => {
    expect(appendTaskToContent("# Notes\n", "Buy milk", "todo", null)).toBe("# Notes\n- [ ] Buy milk\n");
  });
});

describe("setTaskStatusInContent", () => {
  it("rewrites the marker on the given line, leaving text and deadline alone", () => {
    const content = "- [ ] Buy milk (due: 2026-10-05)";
    expect(setTaskStatusInContent(content, 0, "done")).toBe("- [x] Buy milk (due: 2026-10-05)");
  });

  it("preserves indentation", () => {
    expect(setTaskStatusInContent("  - [ ] Nested", 0, "in-progress")).toBe("  - [/] Nested");
  });

  it("is a no-op when the line index is out of range", () => {
    expect(setTaskStatusInContent("- [ ] a", 5, "done")).toBe("- [ ] a");
  });

  it("is a no-op when the line at that index is no longer a task line", () => {
    expect(setTaskStatusInContent("just text", 0, "done")).toBe("just text");
  });
});
