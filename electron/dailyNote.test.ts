import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { openOrCreateDailyNote } from "./dailyNote";

const DATE = new Date(2026, 7, 27); // August 27, 2026

describe("openOrCreateDailyNote", () => {
  const root = path.join(os.tmpdir(), `daily-note-test-${process.pid}`);

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("creates the folder and a scaffolded note on first use, named per the given format", () => {
    const result = openOrCreateDailyNote(root, "YYYY-MM-DD", DATE);
    expect(result.created).toBe(true);
    expect(result.path).toBe(path.join(root, "daily", "2026-08-27.md"));
    expect(fs.existsSync(result.path)).toBe(true);
    expect(fs.readFileSync(result.path, "utf-8")).toContain("2026-08-27");
  });

  it("doesn't leave a blank line at the top of the note body, after frontmatter is stripped", () => {
    const result = openOrCreateDailyNote(root, "YYYY-MM-DD", DATE);
    const raw = fs.readFileSync(result.path, "utf-8");
    const body = raw.replace(/^---\n[\s\S]*?\n---\n/, "");
    expect(body.startsWith("\n")).toBe(false);
  });

  it("opens the existing note instead of overwriting it on a second call", () => {
    const first = openOrCreateDailyNote(root, "YYYY-MM-DD", DATE);
    fs.appendFileSync(first.path, "\nmy notes for today");

    const second = openOrCreateDailyNote(root, "YYYY-MM-DD", DATE);
    expect(second.created).toBe(false);
    expect(second.path).toBe(first.path);
    expect(fs.readFileSync(second.path, "utf-8")).toContain("my notes for today");
  });

  it("uses the given format pattern for the filename and heading", () => {
    const result = openOrCreateDailyNote(root, "dddd, MMMM D, YYYY", DATE);
    expect(result.path).toBe(path.join(root, "daily", "Thursday, August 27, 2026.md"));
    expect(fs.readFileSync(result.path, "utf-8")).toContain("Thursday, August 27, 2026");
  });

  it("sanitizes filesystem-unsafe characters out of the filename without affecting the heading", () => {
    const result = openOrCreateDailyNote(root, "YYYY/MM/DD HH:mm", DATE);
    expect(path.basename(result.path)).toBe("2026-08-27 00-00.md");
    expect(fs.readFileSync(result.path, "utf-8")).toContain("2026/08/27 00:00");
  });
});
