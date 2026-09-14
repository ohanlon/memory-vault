import { describe, expect, it } from "vitest";
import { renderTemplate, templatePlaceholders } from "./templateRender";

describe("templatePlaceholders", () => {
  it("finds plain placeholders in first-appearance order", () => {
    expect(templatePlaceholders("Hello {{name}}, today is {{topic}}.")).toEqual(["name", "topic"]);
  });

  it("dedupes repeated placeholders", () => {
    expect(templatePlaceholders("{{name}} and {{name}} again")).toEqual(["name"]);
  });

  it("excludes built-in variables", () => {
    expect(templatePlaceholders("# {{title}}\n\n{{date}} at {{time}}\n\n{{topic}}")).toEqual(["topic"]);
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
