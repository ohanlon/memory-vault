import { describe, expect, it } from "vitest";
import { slugify, uniqueSlug } from "./slugify";

describe("slugify", () => {
  it("lowercases and hyphenates spaces", () => {
    expect(slugify("My Note")).toBe("my-note");
  });

  it("collapses a run of non-alphanumeric characters into one hyphen", () => {
    expect(slugify("Meeting: 2026-01-01!!")).toBe("meeting-2026-01-01");
  });

  it("trims leading/trailing hyphens", () => {
    expect(slugify("--Hello--")).toBe("hello");
  });

  it("falls back to a default when nothing alphanumeric remains", () => {
    expect(slugify("???")).toBe("note");
  });
});

describe("uniqueSlug", () => {
  it("returns the base slug unchanged the first time", () => {
    const taken = new Set<string>();
    expect(uniqueSlug(taken, "note")).toBe("note");
  });

  it("suffixes -2, -3, ... on repeated collisions", () => {
    const taken = new Set<string>();
    uniqueSlug(taken, "note");
    expect(uniqueSlug(taken, "note")).toBe("note-2");
    expect(uniqueSlug(taken, "note")).toBe("note-3");
  });

  it("records every returned slug in taken", () => {
    const taken = new Set<string>();
    const a = uniqueSlug(taken, "note");
    const b = uniqueSlug(taken, "note");
    expect(taken.has(a)).toBe(true);
    expect(taken.has(b)).toBe(true);
  });
});
