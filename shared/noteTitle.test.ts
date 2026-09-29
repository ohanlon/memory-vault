import { describe, expect, it } from "vitest";
import { invalidTitleReason } from "./noteTitle";

describe("invalidTitleReason", () => {
  it("returns null for an ordinary title", () => {
    expect(invalidTitleReason("My Note")).toBeNull();
  });

  it("rejects an empty title", () => {
    expect(invalidTitleReason("")).not.toBeNull();
  });

  it("rejects each character invalid in a filename", () => {
    for (const bad of ["a/b", "a\\b", "a:b", "a*b", "a?b", 'a"b', "a<b", "a>b", "a|b"]) {
      expect(invalidTitleReason(bad)).not.toBeNull();
    }
  });
});
