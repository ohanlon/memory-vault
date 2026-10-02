import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import matter from "gray-matter";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTaskNote, resolveTasksFolder } from "./tasks";

describe("tasks folder and task notes", () => {
  const root = path.join(os.tmpdir(), `tasks-test-${process.pid}`);

  beforeEach(() => {
    fs.mkdirSync(root, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  describe("resolveTasksFolder", () => {
    it("points at <root>/Tasks when no tasks folder exists yet", () => {
      expect(resolveTasksFolder(root)).toBe(path.join(root, "Tasks"));
    });

    it("reuses a tasks folder the user made by hand, whatever its casing", () => {
      fs.mkdirSync(path.join(root, "tasks"));
      expect(resolveTasksFolder(root)).toBe(path.join(root, "tasks"));
    });

    it("ignores a plain file that happens to be named Tasks", () => {
      fs.writeFileSync(path.join(root, "Tasks"), "");
      expect(resolveTasksFolder(root)).toBe(path.join(root, "Tasks"));
    });
  });

  describe("createTaskNote", () => {
    it("creates the Tasks folder and a note with status and deadline as properties", () => {
      const created = createTaskNote(root, "Buy milk", "2026-10-05", "in-progress");

      expect(created).toBe(path.join(root, "Tasks", "Buy milk.md"));
      const { data, content } = matter(fs.readFileSync(created, "utf-8"));
      expect(data.status).toBe("in-progress");
      expect(data.deadline).toBe("2026-10-05");
      expect(content.trim()).toBe("# Buy milk");
    });

    it("omits the deadline property when there isn't one", () => {
      const created = createTaskNote(root, "Buy milk", null, "todo");
      expect(matter(fs.readFileSync(created, "utf-8")).data).toEqual({ status: "todo" });
    });

    it("adds to an existing hand-made tasks folder instead of creating a second one", () => {
      fs.mkdirSync(path.join(root, "tasks"));
      const created = createTaskNote(root, "Buy milk", null, "todo");

      expect(created).toBe(path.join(root, "tasks", "Buy milk.md"));
      expect(fs.readdirSync(root).filter((n) => n.toLowerCase() === "tasks")).toEqual(["tasks"]);
    });

    it("gives a second task with the same action its own note rather than overwriting", () => {
      const first = createTaskNote(root, "Buy milk", null, "todo");
      const second = createTaskNote(root, "Buy milk", null, "todo");
      expect(second).not.toBe(first);
      expect(fs.existsSync(first)).toBe(true);
      expect(fs.existsSync(second)).toBe(true);
    });

    it("swaps characters invalid in a filename for a hyphen but keeps the action as the heading", () => {
      const created = createTaskNote(root, "Call Bob/Alice: re Q3?", null, "todo");
      expect(path.basename(created)).toBe("Call Bob-Alice- re Q3-.md");
      expect(matter(fs.readFileSync(created, "utf-8")).content.trim()).toBe("# Call Bob/Alice: re Q3?");
    });

    it("keeps an over-long action's file name to a sensible length", () => {
      const created = createTaskNote(root, "x".repeat(300), null, "todo");
      expect(path.basename(created, ".md").length).toBeLessThanOrEqual(80);
    });

    it("rejects an empty action, an unknown status, and a malformed deadline", () => {
      expect(() => createTaskNote(root, "   ", null, "todo")).toThrow();
      expect(() => createTaskNote(root, "A", null, "someday" as never)).toThrow();
      expect(() => createTaskNote(root, "A", "05/10/2026", "todo")).toThrow();
    });
  });
});
