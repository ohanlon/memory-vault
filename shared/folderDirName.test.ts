import { describe, expect, it } from "vitest";
import { sanitizeDirName, uniqueDirName } from "./folderDirName";

describe("sanitizeDirName", () => {
  it("leaves an ordinary name alone", () => {
    expect(sanitizeDirName("Work Notes")).toBe("Work Notes");
  });

  it("replaces path separators and illegal characters", () => {
    expect(sanitizeDirName("a/b\\c:d")).toBe("a-b-c-d");
  });

  it("neutralises traversal and hidden-folder names", () => {
    expect(sanitizeDirName("..")).toBe("Untitled");
    expect(sanitizeDirName("../x")).toBe("-x");
    expect(sanitizeDirName(".secret")).toBe("secret");
  });

  it("strips trailing dots and spaces", () => {
    expect(sanitizeDirName("Notes. .")).toBe("Notes");
  });

  it("avoids Windows reserved device names", () => {
    expect(sanitizeDirName("con")).toBe("Untitled");
    expect(sanitizeDirName("LPT1")).toBe("Untitled");
  });

  it("falls back for empty input", () => {
    expect(sanitizeDirName("   ")).toBe("Untitled");
  });
});

describe("uniqueDirName", () => {
  it("returns the base when free", () => {
    expect(uniqueDirName("Work", () => false)).toBe("Work");
  });

  it("appends a counter until free", () => {
    const taken = new Set(["work", "work-2"]);
    expect(uniqueDirName("Work", (c) => taken.has(c.toLowerCase()))).toBe("Work-3");
  });
});
