import { describe, expect, it } from "vitest";
import { STARTER_NOTES } from "./starterContent";

describe("STARTER_NOTES", () => {
  it("has unique .md filenames", () => {
    const names = STARTER_NOTES.map((n) => n.fileName);
    expect(new Set(names).size).toBe(names.length);
    for (const name of names) expect(name).toMatch(/\.md$/);
  });

  it("links Welcome and Example Note to each other via [[wikilinks]]", () => {
    const welcome = STARTER_NOTES.find((n) => n.fileName === "Welcome.md");
    const example = STARTER_NOTES.find((n) => n.fileName === "Example Note.md");
    expect(welcome?.content).toContain("[[Example Note]]");
    expect(example?.content).toContain("[[Welcome]]");
  });

  it("shares the #example tag between Welcome and Example Note", () => {
    for (const note of STARTER_NOTES) {
      expect(note.content).toMatch(/tags:\s*\[example\]/);
    }
  });
});
