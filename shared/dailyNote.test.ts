import { describe, expect, it } from "vitest";
import { formatDailyNoteFilename, formatDailyNoteHeading, isDailyNote } from "./dailyNote";

const DATE = new Date(2026, 7, 27); // August 27, 2026 (local time, month is 0-indexed)

describe("formatDailyNoteFilename", () => {
  it("orders month-day-year for en-US", () => {
    expect(formatDailyNoteFilename(DATE, "en-US")).toBe("08-27-2026");
  });

  it("orders day-month-year for en-GB", () => {
    expect(formatDailyNoteFilename(DATE, "en-GB")).toBe("27-08-2026");
  });

  it("orders year-month-day for ja-JP", () => {
    expect(formatDailyNoteFilename(DATE, "ja-JP")).toBe("2026-08-27");
  });

  it("never contains a filesystem-unsafe separator", () => {
    for (const locale of ["en-US", "en-GB", "ja-JP", "de-DE", "fr-FR"]) {
      expect(formatDailyNoteFilename(DATE, locale)).toMatch(/^[0-9-]+$/);
    }
  });
});

describe("formatDailyNoteHeading", () => {
  it("produces a full, readable date for en-US", () => {
    expect(formatDailyNoteHeading(DATE, "en-US")).toBe("Thursday, August 27, 2026");
  });
});

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
