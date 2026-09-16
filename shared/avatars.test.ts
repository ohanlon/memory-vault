import { describe, expect, it } from "vitest";
import {
  MERGED_VIEW_AVATAR_COUNT,
  STACK_AVATAR_COUNT,
  avatarCountFor,
  avatarPaletteFor,
  defaultAvatarIndexForName,
} from "./avatars";

describe("avatarCountFor", () => {
  it("returns 12 for stacks and 6 for merged views", () => {
    expect(avatarCountFor("stack")).toBe(12);
    expect(avatarCountFor("mergedView")).toBe(6);
    expect(STACK_AVATAR_COUNT).toBe(12);
    expect(MERGED_VIEW_AVATAR_COUNT).toBe(6);
  });
});

describe("defaultAvatarIndexForName", () => {
  it("is deterministic for the same name", () => {
    expect(defaultAvatarIndexForName("Work", 12)).toBe(defaultAvatarIndexForName("Work", 12));
  });

  it("stays within [0, count) across a range of names", () => {
    const names = ["", "a", "Work Notes", "🎉 emoji", "Very Long Stack Name With Spaces"];
    for (const name of names) {
      for (const count of [STACK_AVATAR_COUNT, MERGED_VIEW_AVATAR_COUNT]) {
        const index = defaultAvatarIndexForName(name, count);
        expect(index).toBeGreaterThanOrEqual(0);
        expect(index).toBeLessThan(count);
      }
    }
  });

  it("differs for different names most of the time", () => {
    const indices = new Set(["Work", "Personal", "Journal", "Recipes", "Archive"].map((n) => defaultAvatarIndexForName(n, 12)));
    expect(indices.size).toBeGreaterThan(1);
  });
});

describe("avatarPaletteFor", () => {
  it("never throws across the full index range for both kinds", () => {
    for (const kind of ["stack", "mergedView"] as const) {
      const count = avatarCountFor(kind);
      for (let i = 0; i < count; i++) {
        expect(() => avatarPaletteFor(kind, i)).not.toThrow();
      }
    }
  });

  it("is deterministic for the same (kind, index)", () => {
    expect(avatarPaletteFor("stack", 3)).toEqual(avatarPaletteFor("stack", 3));
  });

  it("wraps an out-of-range index's hue via modulo instead of throwing", () => {
    expect(avatarPaletteFor("mergedView", 6).hue).toBe(avatarPaletteFor("mergedView", 0).hue);
    expect(avatarPaletteFor("mergedView", -1).hue).toBe(avatarPaletteFor("mergedView", 5).hue);
  });

  it("returns a hue from the fixed set for the given kind", () => {
    const palette = avatarPaletteFor("stack", 4);
    expect(typeof palette.hue).toBe("number");
    expect(palette.blobs).toHaveLength(5);
  });
});
