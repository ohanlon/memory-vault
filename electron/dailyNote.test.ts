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

  it("creates the folder and a scaffolded note on first use", () => {
    const result = openOrCreateDailyNote(root, "Daily Notes", "en-US", DATE);
    expect(result.created).toBe(true);
    expect(result.path).toBe(path.join(root, "Daily Notes", "08-27-2026.md"));
    expect(fs.existsSync(result.path)).toBe(true);
    expect(fs.readFileSync(result.path, "utf-8")).toContain("Thursday, August 27, 2026");
  });

  it("opens the existing note instead of overwriting it on a second call", () => {
    const first = openOrCreateDailyNote(root, "Daily Notes", "en-US", DATE);
    fs.appendFileSync(first.path, "\nmy notes for today");

    const second = openOrCreateDailyNote(root, "Daily Notes", "en-US", DATE);
    expect(second.created).toBe(false);
    expect(second.path).toBe(first.path);
    expect(fs.readFileSync(second.path, "utf-8")).toContain("my notes for today");
  });

  it("respects a custom folder name", () => {
    const result = openOrCreateDailyNote(root, "Journal", "en-US", DATE);
    expect(result.path).toBe(path.join(root, "Journal", "08-27-2026.md"));
  });

  it("uses the given locale's date ordering in the filename", () => {
    const result = openOrCreateDailyNote(root, "Daily Notes", "en-GB", DATE);
    expect(result.path).toBe(path.join(root, "Daily Notes", "27-08-2026.md"));
  });
});
