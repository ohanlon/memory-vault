import Mustache from "mustache";
import type { TemplateSpans } from "mustache";
import { formatDateWithPattern } from "./dateFormat";

/** Default format pattern for each built-in date/time variable, used when a tag doesn't supply its own (e.g. {{date:YYYY-MM-DD}} overrides {{date}}'s default). */
export interface DateVarDefaults {
  date: string;
  time: string;
  datetime: string;
}

// Matches {{date}}, {{time}}, {{datetime}}, and their {{date:FORMAT}}
// variants. Handled with its own regex rather than Mustache's tag parser —
// a colon-bearing tag name isn't something to rely on Mustache accepting.
const DATE_VAR_TAG_RE = /\{\{\s*(date|time|datetime)\s*(?::\s*([^}]+?))?\s*\}\}/g;

/**
 * Replaces every {{date}}/{{time}}/{{datetime}} tag in `template` with its
 * formatted value for `now`, using `defaults` unless the tag supplies its
 * own format string (e.g. {{date:YYYY-MM-DD}}). Runs before the general
 * mustache render pass in renderTemplate, so these tags are gone by the
 * time Mustache ever sees the template.
 */
export function expandBuiltInDateVars(template: string, now: Date, defaults: DateVarDefaults): string {
  return template.replace(DATE_VAR_TAG_RE, (_match, kind: keyof DateVarDefaults, customFormat?: string) => {
    const pattern = customFormat?.trim() || defaults[kind];
    return formatDateWithPattern(now, pattern);
  });
}

/**
 * Every plain {{variable}} placeholder in `template`, in first-appearance
 * order, excluding built-ins ("title", and any {{date}}/{{time}}/
 * {{datetime}} tag, with or without a custom format — those are expanded
 * automatically by expandBuiltInDateVars, not user-fillable).
 * Section/inverted-section tags aren't treated as placeholders — they're
 * structural, not fill-in-the-blank — so only their contents are scanned
 * for nested placeholders.
 */
export function templatePlaceholders(template: string): string[] {
  const withoutDateVars = template.replace(DATE_VAR_TAG_RE, "");
  const seen = new Set<string>();
  const names: string[] = [];
  const scan = (tokens: TemplateSpans) => {
    for (const token of tokens) {
      const [type, name, , , children] = token;
      if ((type === "name" || type === "&") && name !== "title" && !seen.has(name)) {
        seen.add(name);
        names.push(name);
      }
      if (Array.isArray(children)) scan(children);
    }
  };
  try {
    scan(Mustache.parse(withoutDateVars));
  } catch {
    // Invalid mustache syntax — nothing to prompt for; render() will surface the error instead.
  }
  return names;
}

/** Renders `template` against `values` without HTML-escaping — this produces markdown, not HTML. */
export function renderTemplate(template: string, values: Record<string, string>): string {
  return Mustache.render(template, values, undefined, { escape: (v: unknown) => String(v) });
}
