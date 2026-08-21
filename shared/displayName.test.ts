import { describe, expect, it } from "vitest";
import { stripMdExtension } from "./displayName";

describe("stripMdExtension", () => {
  it("strips a trailing .md extension", () => {
    expect(stripMdExtension("Note.md")).toBe("Note");
  });

  it("is case-insensitive", () => {
    expect(stripMdExtension("Note.MD")).toBe("Note");
  });

  it("preserves subfolder structure", () => {
    expect(stripMdExtension("folder/Sub Note.md")).toBe("folder/Sub Note");
  });

  it("preserves windows-style separators", () => {
    expect(stripMdExtension("folder\\Sub Note.md")).toBe("folder\\Sub Note");
  });

  it("leaves a path without a .md extension unchanged", () => {
    expect(stripMdExtension("Note")).toBe("Note");
  });

  it("does not strip .md occurring mid-name", () => {
    expect(stripMdExtension("Note.md.bak")).toBe("Note.md.bak");
  });
});
