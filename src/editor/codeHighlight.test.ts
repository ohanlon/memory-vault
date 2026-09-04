import { describe, expect, it } from "vitest";
import { ensureLanguagesLoaded, extractNeededLanguageIds, highlightCode, resolveLanguageId } from "./codeHighlight";

describe("resolveLanguageId", () => {
  it("returns undefined for a missing or empty info string", () => {
    expect(resolveLanguageId(undefined)).toBeUndefined();
    expect(resolveLanguageId("")).toBeUndefined();
  });

  it("returns undefined for an unrecognized language", () => {
    expect(resolveLanguageId("not-a-real-language")).toBeUndefined();
  });

  it("resolves a canonical id to itself", () => {
    expect(resolveLanguageId("javascript")).toBe("javascript");
  });

  it("resolves common aliases to their canonical id", () => {
    expect(resolveLanguageId("js")).toBe("javascript");
    expect(resolveLanguageId("py")).toBe("python");
    expect(resolveLanguageId("html")).toBe("xml");
    expect(resolveLanguageId("cs")).toBe("csharp");
  });

  it("is case-insensitive and ignores extra info-string content", () => {
    expect(resolveLanguageId("JavaScript")).toBe("javascript");
    expect(resolveLanguageId('js title="example"')).toBe("javascript");
  });
});

describe("extractNeededLanguageIds", () => {
  it("finds every enabled language referenced by a fenced code block", () => {
    const content = "```js\nconst x = 1;\n```\n\nsome text\n\n```py\nx = 1\n```";
    const enabled = new Set(["javascript", "python"]);
    expect(extractNeededLanguageIds(content, enabled).sort()).toEqual(["javascript", "python"]);
  });

  it("excludes languages that aren't enabled", () => {
    const content = "```js\nconst x = 1;\n```";
    expect(extractNeededLanguageIds(content, new Set(["python"]))).toEqual([]);
  });

  it("excludes unlabeled fences and unrecognized languages", () => {
    const content = "```\nplain\n```\n\n```not-a-real-language\nfoo\n```";
    expect(extractNeededLanguageIds(content, new Set(["javascript"]))).toEqual([]);
  });

  it("deduplicates repeated languages", () => {
    const content = "```js\na\n```\n\n```js\nb\n```";
    expect(extractNeededLanguageIds(content, new Set(["javascript"]))).toEqual(["javascript"]);
  });
});

describe("highlightCode", () => {
  it("returns null when the language isn't enabled, even if it's loaded", async () => {
    await ensureLanguagesLoaded(["javascript"]);
    expect(highlightCode("const x = 1;", "javascript", new Set())).toBeNull();
  });

  it("returns null when the language hasn't been loaded yet, even if enabled", () => {
    expect(highlightCode("some code", "not-a-real-language", new Set(["not-a-real-language"]))).toBeNull();
  });

  it("highlights an enabled, loaded language", async () => {
    await ensureLanguagesLoaded(["python"]);
    const result = highlightCode("def f():\n    pass", "python", new Set(["python"]));
    expect(result).not.toBeNull();
    expect(result?.language).toBe("python");
    expect(result?.html).toContain("hljs-keyword");
  });

  it("resolves aliases before checking the enabled set", async () => {
    await ensureLanguagesLoaded(["rust"]);
    const result = highlightCode("fn main() {}", "rs", new Set(["rust"]));
    expect(result?.language).toBe("rust");
  });
});

describe("ensureLanguagesLoaded", () => {
  it("makes a language available to highlightCode afterward", async () => {
    expect(highlightCode("SELECT 1;", "sql", new Set(["sql"]))).toBeNull();
    await ensureLanguagesLoaded(["sql"]);
    expect(highlightCode("SELECT 1;", "sql", new Set(["sql"]))).not.toBeNull();
  });

  it("does not throw for an unrecognized id", async () => {
    await expect(ensureLanguagesLoaded(["not-a-real-language"])).resolves.toBeUndefined();
  });

  it("is idempotent", async () => {
    await ensureLanguagesLoaded(["yaml"]);
    await expect(ensureLanguagesLoaded(["yaml"])).resolves.toBeUndefined();
  });
});
