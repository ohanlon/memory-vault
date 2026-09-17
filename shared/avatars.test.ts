import { describe, expect, it } from "vitest";
import { NOTES_FOLDER_AVATAR_COUNT, avatarPaletteFor, defaultAvatarIndexForName } from "./avatars";

describe("NOTES_FOLDER_AVATAR_COUNT", () => {
  it("is 12", () => {
    expect(NOTES_FOLDER_AVATAR_COUNT).toBe(12);
  });
});

describe("defaultAvatarIndexForName", () => {
  it("is deterministic for the same name", () => {
    expect(defaultAvatarIndexForName("Work", 12)).toBe(defaultAvatarIndexForName("Work", 12));
  });

  it("stays within [0, count) across a range of names", () => {
    const names = ["", "a", "Work Notes", "🎉 emoji", "Very Long Notes Folder Name With Spaces"];
    for (const name of names) {
      const index = defaultAvatarIndexForName(name, NOTES_FOLDER_AVATAR_COUNT);
      expect(index).toBeGreaterThanOrEqual(0);
      expect(index).toBeLessThan(NOTES_FOLDER_AVATAR_COUNT);
    }
  });

  it("differs for different names most of the time", () => {
    const indices = new Set(["Work", "Personal", "Journal", "Recipes", "Archive"].map((n) => defaultAvatarIndexForName(n, 12)));
    expect(indices.size).toBeGreaterThan(1);
  });
});

describe("avatarPaletteFor", () => {
  it("never throws across the full index range", () => {
    for (let i = 0; i < NOTES_FOLDER_AVATAR_COUNT; i++) {
      expect(() => avatarPaletteFor(i)).not.toThrow();
    }
  });

  it("is deterministic for the same index", () => {
    expect(avatarPaletteFor(3)).toEqual(avatarPaletteFor(3));
  });

  it("wraps an out-of-range index's hue via modulo instead of throwing", () => {
    expect(avatarPaletteFor(NOTES_FOLDER_AVATAR_COUNT).hue).toBe(avatarPaletteFor(0).hue);
    expect(avatarPaletteFor(-1).hue).toBe(avatarPaletteFor(NOTES_FOLDER_AVATAR_COUNT - 1).hue);
  });

  it("returns a hue from the fixed set", () => {
    const palette = avatarPaletteFor(4);
    expect(typeof palette.hue).toBe("number");
    expect(palette.blobs).toHaveLength(5);
  });
});
