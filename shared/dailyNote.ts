/**
 * Filename (no extension) for a daily note, in the given locale's own
 * year/month/day ordering (e.g. en-US -> "08-27-2026", en-GB ->
 * "27-08-2026") joined with "-" so it's filesystem-safe regardless of
 * which literal separator that locale would normally use.
 */
export function formatDailyNoteFilename(date: Date, locale: string): string {
  const parts = new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  return parts
    .filter((part) => part.type === "year" || part.type === "month" || part.type === "day")
    .map((part) => part.value)
    .join("-");
}

/** Human-readable heading for the scaffolded note content, e.g. "Thursday, August 27, 2026". */
export function formatDailyNoteHeading(date: Date, locale: string): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: "full" }).format(date);
}
