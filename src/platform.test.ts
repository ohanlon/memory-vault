import { describe, expect, it } from "vitest";
import { matchesShortcut, shortcutLabel } from "./platform";

describe("shortcutLabel", () => {
  it("uses the command glyph on macOS", () => {
    expect(shortcutLabel("c", true)).toBe("⌘C");
  });

  it("uses Ctrl+ elsewhere", () => {
    expect(shortcutLabel("c", false)).toBe("Ctrl+C");
  });
});

describe("matchesShortcut", () => {
  it("matches Cmd+key on macOS", () => {
    expect(matchesShortcut({ key: "c", ctrlKey: false, metaKey: true }, "c", true)).toBe(true);
  });

  it("does not match Ctrl+key on macOS", () => {
    expect(matchesShortcut({ key: "c", ctrlKey: true, metaKey: false }, "c", true)).toBe(false);
  });

  it("matches Ctrl+key off macOS", () => {
    expect(matchesShortcut({ key: "c", ctrlKey: true, metaKey: false }, "c", false)).toBe(true);
  });

  it("does not match Cmd+key off macOS", () => {
    expect(matchesShortcut({ key: "c", ctrlKey: false, metaKey: true }, "c", false)).toBe(false);
  });

  it("is case-insensitive on the key", () => {
    expect(matchesShortcut({ key: "C", ctrlKey: true, metaKey: false }, "c", false)).toBe(true);
  });

  it("does not match without the modifier", () => {
    expect(matchesShortcut({ key: "c", ctrlKey: false, metaKey: false }, "c", false)).toBe(false);
  });
});
