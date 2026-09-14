const MONTHS_LONG = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
const MONTHS_SHORT = MONTHS_LONG.map((m) => m.slice(0, 3));
const WEEKDAYS_LONG = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const WEEKDAYS_SHORT = WEEKDAYS_LONG.map((d) => d.slice(0, 3));

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

// Bracketed text (e.g. "[Daily]") is matched first so it's taken as a
// literal escape hatch — without it, ordinary words collide with the
// single-letter tokens below (e.g. "Daily" contains both "D" and "a").
// Ordered longest-first within each token family so e.g. "YYYY" matches before "YY" does.
const TOKEN_RE = /\[[^\]]*\]|YYYY|YY|MMMM|MMM|MM|M|dddd|ddd|DD|D|HH|H|hh|h|mm|m|ss|s|A|a/g;

/**
 * Substitutes date/time tokens in `pattern` (YYYY, YY, MMMM/MMM/MM/M,
 * dddd/ddd, DD/D, HH/H, hh/h, mm/m, ss/s, A/a) with `date`'s values; text
 * wrapped in [brackets] is passed through literally instead of being
 * tokenized (needed since ordinary words can otherwise collide with the
 * single-letter tokens — e.g. "Daily" contains "D" and "a"). Every other
 * character (separators, spaces, etc.) passes through as-is.
 */
export function formatDateWithPattern(date: Date, pattern: string): string {
  const hours24 = date.getHours();
  return pattern.replace(TOKEN_RE, (token) => {
    if (token.startsWith("[")) return token.slice(1, -1);
    switch (token) {
      case "YYYY":
        return String(date.getFullYear());
      case "YY":
        return pad(date.getFullYear() % 100);
      case "MMMM":
        return MONTHS_LONG[date.getMonth()];
      case "MMM":
        return MONTHS_SHORT[date.getMonth()];
      case "MM":
        return pad(date.getMonth() + 1);
      case "M":
        return String(date.getMonth() + 1);
      case "dddd":
        return WEEKDAYS_LONG[date.getDay()];
      case "ddd":
        return WEEKDAYS_SHORT[date.getDay()];
      case "DD":
        return pad(date.getDate());
      case "D":
        return String(date.getDate());
      case "HH":
        return pad(hours24);
      case "H":
        return String(hours24);
      case "hh":
        return pad(((hours24 + 11) % 12) + 1);
      case "h":
        return String(((hours24 + 11) % 12) + 1);
      case "mm":
        return pad(date.getMinutes());
      case "m":
        return String(date.getMinutes());
      case "ss":
        return pad(date.getSeconds());
      case "s":
        return String(date.getSeconds());
      case "A":
        return hours24 < 12 ? "AM" : "PM";
      case "a":
        return hours24 < 12 ? "am" : "pm";
      default:
        return token;
    }
  });
}

const MAX_PATTERN_LENGTH = 64;
// Characters that could never belong in a rendered date — glob/quote
// characters invalid in a filename on at least one major OS, plus control
// characters. Common separators like "/" and ":" are allowed here (they're
// normal in a date/time pattern); callers that render into a filename are
// responsible for sanitizing those out of the *result*.
const INVALID_PATTERN_CHARS_RE = /[*?"<>|\x00-\x1f]/;

/** A format pattern is valid if it's non-empty, not absurdly long, and free of characters that could never belong in a rendered date. */
export function isValidDateFormat(pattern: string): boolean {
  const trimmed = pattern.trim();
  return trimmed.length > 0 && trimmed.length <= MAX_PATTERN_LENGTH && !INVALID_PATTERN_CHARS_RE.test(trimmed);
}
