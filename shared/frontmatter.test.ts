import { describe, expect, it } from "vitest";
import { hasFrontmatter, stripFrontmatter } from "./frontmatter";

describe("stripFrontmatter", () => {
  it("returns content unchanged when there is no frontmatter", () => {
    expect(stripFrontmatter("# Heading\n\nbody text")).toBe("# Heading\n\nbody text");
  });

  it("strips a simple frontmatter block", () => {
    const raw = "---\ntitle: Foo\n---\n# Heading\n";
    expect(stripFrontmatter(raw)).toBe("# Heading\n");
  });

  it("does not strip a --- that appears later in the body", () => {
    const raw = "# Heading\n\n---\n\nmore text";
    expect(stripFrontmatter(raw)).toBe(raw);
  });

  it("handles CRLF line endings", () => {
    const raw = "---\r\ntitle: Foo\r\n---\r\n# Heading\r\n";
    expect(stripFrontmatter(raw)).toBe("# Heading\r\n");
  });

  it("handles frontmatter with no trailing blank line before body", () => {
    const raw = "---\ntitle: Foo\n---\nBody starts immediately";
    expect(stripFrontmatter(raw)).toBe("Body starts immediately");
  });

  it("handles an empty file", () => {
    expect(stripFrontmatter("")).toBe("");
  });
});

describe("hasFrontmatter", () => {
  it("returns false when there is no frontmatter", () => {
    expect(hasFrontmatter("# Heading")).toBe(false);
  });

  it("returns true when a frontmatter block is present", () => {
    expect(hasFrontmatter("---\ntitle: Foo\n---\nBody")).toBe(true);
  });

  it("returns false for a --- that appears later in the body, not at the start", () => {
    expect(hasFrontmatter("# Heading\n\n---\n")).toBe(false);
  });
});
