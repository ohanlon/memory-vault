import Mustache from "mustache";
import type { TemplateSpans } from "mustache";

/** Built-in template variables the app fills in automatically — never prompted for. */
export const BUILT_IN_TEMPLATE_VARS = ["title", "date", "time", "datetime"];

/**
 * Every plain {{variable}} placeholder in `template`, in first-appearance
 * order, excluding built-ins. Section/inverted-section tags aren't treated
 * as placeholders — they're structural, not fill-in-the-blank — so only
 * their contents are scanned for nested placeholders.
 */
export function templatePlaceholders(template: string): string[] {
  const seen = new Set<string>();
  const names: string[] = [];
  const scan = (tokens: TemplateSpans) => {
    for (const token of tokens) {
      const [type, name, , , children] = token;
      if ((type === "name" || type === "&") && !BUILT_IN_TEMPLATE_VARS.includes(name) && !seen.has(name)) {
        seen.add(name);
        names.push(name);
      }
      if (Array.isArray(children)) scan(children);
    }
  };
  try {
    scan(Mustache.parse(template));
  } catch {
    // Invalid mustache syntax — nothing to prompt for; render() will surface the error instead.
  }
  return names;
}

/** Renders `template` against `values` without HTML-escaping — this produces markdown, not HTML. */
export function renderTemplate(template: string, values: Record<string, string>): string {
  return Mustache.render(template, values, undefined, { escape: (v: unknown) => String(v) });
}

/** {{time}}, in the given locale's short form (e.g. "3:45 PM") — there's no dedicated time-format setting, unlike {{date}}/{{datetime}} (see shared/dateFormat.ts). */
export function formatTemplateTime(date: Date, locale: string): string {
  return new Intl.DateTimeFormat(locale, { timeStyle: "short" }).format(date);
}
