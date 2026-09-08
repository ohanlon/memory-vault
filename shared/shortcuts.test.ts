import { describe, expect, it } from "vitest";
import { SHORTCUTS } from "./shortcuts";

describe("SHORTCUTS", () => {
  it("has unique ids", () => {
    const ids = SHORTCUTS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("has non-empty label, keys, and context for every entry", () => {
    for (const entry of SHORTCUTS) {
      expect(entry.label.trim()).not.toBe("");
      expect(entry.keys.trim()).not.toBe("");
      expect(entry.context.trim()).not.toBe("");
    }
  });
});
