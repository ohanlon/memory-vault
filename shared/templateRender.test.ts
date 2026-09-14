import { describe, expect, it } from "vitest";
import { expandBuiltInDateVars, renderTemplate, templatePlaceholders } from "./templateRender";

const DEFAULTS = { date: "YYYY-MM-DD", time: "HH:mm", datetime: "YYYY-MM-DD HH:mm" };
const NOW = new Date(2026, 7, 27, 14, 5); // August 27, 2026, 14:05

describe("templatePlaceholders", () => {
  it("finds plain placeholders in first-appearance order", () => {
    expect(templatePlaceholders("Hello {{name}}, today is {{topic}}.")).toEqual(["name", "topic"]);
  });

  it("dedupes repeated placeholders", () => {
    expect(templatePlaceholders("{{name}} and {{name}} again")).toEqual(["name"]);
  });

  it("excludes built-in variables", () => {
    expect(
      templatePlaceholders("# {{title}}\n\n{{date}} at {{time}} ({{datetime}})\n\n{{topic}}")
    ).toEqual(["topic"]);
  });

  it("excludes built-in date/time/datetime variables even with a custom format", () => {
    expect(templatePlaceholders("{{date:YYYY}} {{time:h:mm a}} {{datetime:YYYY/MM/DD}} {{topic}}")).toEqual([
      "topic",
    ]);
  });

  it("doesn't treat a section tag itself as a placeholder, but scans inside it", () => {
    expect(templatePlaceholders("{{#attendees}}{{name}}{{/attendees}}")).toEqual(["name"]);
  });

  it("returns an empty list for a template with no placeholders", () => {
    expect(templatePlaceholders("# Just a heading\n\nSome text.")).toEqual([]);
  });

  it("returns an empty list for invalid mustache syntax instead of throwing", () => {
    expect(templatePlaceholders("{{#unclosed")).toEqual([]);
  });
});

describe("expandBuiltInDateVars", () => {
  it("expands {{date}}, {{time}}, and {{datetime}} using the given defaults", () => {
    expect(expandBuiltInDateVars("{{date}} {{time}} {{datetime}}", NOW, DEFAULTS)).toBe(
      "2026-08-27 14:05 2026-08-27 14:05"
    );
  });

  it("uses a tag's own format instead of the default when given", () => {
    expect(expandBuiltInDateVars("{{date:YYYY}}", NOW, DEFAULTS)).toBe("2026");
    expect(expandBuiltInDateVars("{{time:h:mm a}}", NOW, DEFAULTS)).toBe("2:05 pm");
  });

  it("leaves everything else untouched", () => {
    expect(expandBuiltInDateVars("# {{title}}\n\n{{topic}}", NOW, DEFAULTS)).toBe("# {{title}}\n\n{{topic}}");
  });
});

describe("renderTemplate", () => {
  it("substitutes plain placeholders", () => {
    expect(renderTemplate("Hello {{name}}!", { name: "Ada" })).toBe("Hello Ada!");
  });

  it("does not HTML-escape values", () => {
    expect(renderTemplate("{{text}}", { text: "<b>&</b>" })).toBe("<b>&</b>");
  });

  it("supports mustache sections", () => {
    expect(renderTemplate("{{#show}}visible{{/show}}{{^show}}hidden{{/show}}", { show: "" })).toBe("hidden");
  });
});
