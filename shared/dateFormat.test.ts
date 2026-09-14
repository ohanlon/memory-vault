import { describe, expect, it } from "vitest";
import { formatDateWithPattern, isValidDateFormat } from "./dateFormat";

// Thursday, August 27, 2026, 14:05:09 (local time, month is 0-indexed)
const DATE = new Date(2026, 7, 27, 14, 5, 9);

describe("formatDateWithPattern", () => {
  it("substitutes year/month/day tokens", () => {
    expect(formatDateWithPattern(DATE, "YYYY-MM-DD")).toBe("2026-08-27");
  });

  it("substitutes unpadded month/day tokens", () => {
    expect(formatDateWithPattern(DATE, "M/D/YY")).toBe("8/27/26");
  });

  it("substitutes month and weekday names", () => {
    expect(formatDateWithPattern(DATE, "dddd, MMMM D, YYYY")).toBe("Thursday, August 27, 2026");
    expect(formatDateWithPattern(DATE, "ddd MMM D")).toBe("Thu Aug 27");
  });

  it("substitutes 24-hour and 12-hour time tokens", () => {
    expect(formatDateWithPattern(DATE, "HH:mm:ss")).toBe("14:05:09");
    expect(formatDateWithPattern(DATE, "h:mm A")).toBe("2:05 PM");
    expect(formatDateWithPattern(DATE, "hh:mm a")).toBe("02:05 pm");
  });

  it("handles midnight/noon boundaries for 12-hour tokens", () => {
    const midnight = new Date(2026, 7, 27, 0, 0, 0);
    const noon = new Date(2026, 7, 27, 12, 0, 0);
    expect(formatDateWithPattern(midnight, "h A")).toBe("12 AM");
    expect(formatDateWithPattern(noon, "h A")).toBe("12 PM");
  });

  it("passes unrecognized punctuation through literally", () => {
    expect(formatDateWithPattern(DATE, "YYYY-MM-DD!")).toBe("2026-08-27!");
  });

  it("treats [bracketed] text as a literal escape hatch, since plain words can collide with single-letter tokens", () => {
    // Unescaped, "Daily" would be mangled: "D" and "a" are both tokens (day-of-month, am/pm).
    expect(formatDateWithPattern(DATE, "[Daily] YYYY-MM-DD")).toBe("Daily 2026-08-27");
  });
});

describe("isValidDateFormat", () => {
  it("rejects an empty or whitespace-only pattern", () => {
    expect(isValidDateFormat("")).toBe(false);
    expect(isValidDateFormat("   ")).toBe(false);
  });

  it("accepts a normal pattern", () => {
    expect(isValidDateFormat("YYYY-MM-DD")).toBe(true);
    expect(isValidDateFormat("HH:mm")).toBe(true);
  });

  it("rejects characters that could never belong in a rendered date", () => {
    expect(isValidDateFormat('YYYY-MM-DD "quoted"')).toBe(false);
    expect(isValidDateFormat("YYYY-MM-DD*")).toBe(false);
    expect(isValidDateFormat("YYYY-MM-DD?")).toBe(false);
  });

  it("rejects a pattern that's too long", () => {
    expect(isValidDateFormat("Y".repeat(65))).toBe(false);
  });
});
