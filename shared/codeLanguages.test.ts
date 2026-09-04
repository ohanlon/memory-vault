import { describe, expect, it } from "vitest";
import { CODE_LANGUAGES, CODE_LANGUAGE_ALIASES, DEFAULT_ENABLED_CODE_LANGUAGES } from "./codeLanguages";

describe("CODE_LANGUAGES", () => {
  it("excludes Brainfuck", () => {
    expect(CODE_LANGUAGES.some((l) => l.id === "brainfuck")).toBe(false);
    expect(CODE_LANGUAGES.some((l) => l.name.toLowerCase().includes("brainfuck"))).toBe(false);
  });

  it("has no duplicate ids", () => {
    const ids = CODE_LANGUAGES.map((l) => l.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("is sorted alphabetically by name", () => {
    const names = CODE_LANGUAGES.map((l) => l.name);
    const sorted = [...names].sort((a, b) => a.localeCompare(b));
    expect(names).toEqual(sorted);
  });
});

describe("DEFAULT_ENABLED_CODE_LANGUAGES", () => {
  it("only references known language ids", () => {
    const known = new Set(CODE_LANGUAGES.map((l) => l.id));
    for (const id of DEFAULT_ENABLED_CODE_LANGUAGES) {
      expect(known.has(id)).toBe(true);
    }
  });

  it("covers every requested default language", () => {
    const byId = new Map(CODE_LANGUAGES.map((l) => [l.id, l.name]));
    const defaultNames = new Set(DEFAULT_ENABLED_CODE_LANGUAGES.map((id) => byId.get(id)));
    for (const expected of ["C#", "AppleScript", "Bash", "C", "C++", "Java", "JavaScript", "TypeScript", "CSS", "Gherkin", "JSON", "Kotlin", "Markdown"]) {
      expect(defaultNames.has(expected)).toBe(true);
    }
    // HTML and XML share one combined highlight.js grammar.
    expect(defaultNames.has("HTML, XML")).toBe(true);
  });
});

describe("CODE_LANGUAGE_ALIASES", () => {
  it("maps every id to itself", () => {
    for (const lang of CODE_LANGUAGES) {
      expect(CODE_LANGUAGE_ALIASES[lang.id]).toBe(lang.id);
    }
  });

  it("resolves common aliases to their canonical id", () => {
    expect(CODE_LANGUAGE_ALIASES.js).toBe("javascript");
    expect(CODE_LANGUAGE_ALIASES.html).toBe("xml");
    expect(CODE_LANGUAGE_ALIASES.py).toBe("python");
    expect(CODE_LANGUAGE_ALIASES.cs).toBe("csharp");
  });

  it("returns undefined for an unknown token", () => {
    expect(CODE_LANGUAGE_ALIASES["not-a-real-language"]).toBeUndefined();
  });
});
