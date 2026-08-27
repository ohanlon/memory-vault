import { describe, expect, it } from "vitest";
import { formatDailyNoteFilename, formatDailyNoteHeading } from "./dailyNote";

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
