import { describe, expect, it } from "vitest";
import { basename, dirname, stripMdExtension } from "./displayName";

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

describe("basename", () => {
  it("returns the last segment of a forward-slash path", () => {
    expect(basename("/Users/pete/Notes")).toBe("Notes");
  });

  it("returns the last segment of a windows-style path", () => {
    expect(basename("C:\\Users\\pete\\Notes")).toBe("Notes");
  });

  it("ignores a trailing separator", () => {
    expect(basename("/Users/pete/Notes/")).toBe("Notes");
  });

  it("returns the whole string when there's no separator", () => {
    expect(basename("Notes")).toBe("Notes");
  });
});

describe("dirname", () => {
  it("returns everything before the last segment of a forward-slash path", () => {
    expect(dirname("/Users/pete/Notes/Note.md")).toBe("/Users/pete/Notes");
  });

  it("returns everything before the last segment of a windows-style path", () => {
    expect(dirname("C:\\Users\\pete\\Notes\\Note.md")).toBe("C:\\Users\\pete\\Notes");
  });

  it("returns an empty string when there's no separator", () => {
    expect(dirname("Note.md")).toBe("");
  });
});
