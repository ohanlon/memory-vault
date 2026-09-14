import { describe, expect, it } from "vitest";
import { isDailyNote } from "./dailyNote";

describe("isDailyNote", () => {
  it("is true for a note directly under the daily folder", () => {
    expect(isDailyNote("daily/2026-08-27.md")).toBe(true);
  });

  it("handles a Windows-style backslash separator", () => {
    expect(isDailyNote("daily\\2026-08-27.md")).toBe(true);
  });

  it("is false for a note in a different folder", () => {
    expect(isDailyNote("Journal/2026-08-27.md")).toBe(false);
  });

  it("is false for a note at the stack root", () => {
    expect(isDailyNote("2026-08-27.md")).toBe(false);
  });

  it("is false for a note whose path merely starts with 'daily' as a prefix, not a folder", () => {
    expect(isDailyNote("dailies.md")).toBe(false);
  });
});
