import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { readNoteBody, readNoteProperties, saveNoteBody, saveNoteProperties } from "./noteProperties";

describe("noteProperties", () => {
  const tmpFile = path.join(os.tmpdir(), `note-properties-test-${process.pid}.md`);

  afterEach(() => {
    fs.rmSync(tmpFile, { force: true });
  });

  it("readNoteProperties returns {} for a note with no frontmatter", () => {
    fs.writeFileSync(tmpFile, "# Heading\n\nbody", "utf-8");
    expect(readNoteProperties(tmpFile)).toEqual({});
  });

  it("readNoteProperties parses an existing frontmatter block", () => {
    fs.writeFileSync(tmpFile, "---\nstatus: Reading\n---\n# Heading\n", "utf-8");
    expect(readNoteProperties(tmpFile)).toEqual({ status: "Reading" });
  });

  it("readNoteBody strips the frontmatter block", () => {
    fs.writeFileSync(tmpFile, "---\nstatus: Reading\n---\n# Heading\n", "utf-8");
    expect(readNoteBody(tmpFile)).toBe("# Heading\n");
  });

  it("saveNoteProperties preserves the body byte-for-byte", () => {
    fs.writeFileSync(tmpFile, "# Heading\n\nSome body text.\n", "utf-8");
    saveNoteProperties(tmpFile, { status: "Reading" });
    expect(readNoteBody(tmpFile)).toBe("# Heading\n\nSome body text.\n");
    expect(readNoteProperties(tmpFile)).toEqual({ status: "Reading" });
  });

  it("saveNoteProperties adds frontmatter to a note that had none", () => {
    fs.writeFileSync(tmpFile, "# Heading\n", "utf-8");
    saveNoteProperties(tmpFile, { pages: 320 });
    const raw = fs.readFileSync(tmpFile, "utf-8");
    expect(raw.startsWith("---\n")).toBe(true);
    expect(readNoteProperties(tmpFile)).toEqual({ pages: 320 });
  });

  it("saveNoteProperties removes the frontmatter block when properties is empty", () => {
    fs.writeFileSync(tmpFile, "---\nstatus: Reading\n---\n# Heading\n", "utf-8");
    saveNoteProperties(tmpFile, {});
    const raw = fs.readFileSync(tmpFile, "utf-8");
    expect(raw.startsWith("---")).toBe(false);
  });

  it("round-trips unicode values", () => {
    fs.writeFileSync(tmpFile, "# Heading\n", "utf-8");
    saveNoteProperties(tmpFile, { rating: "★★★★☆" });
    expect(readNoteProperties(tmpFile)).toEqual({ rating: "★★★★☆" });
  });

  it("saveNoteBody preserves existing frontmatter", () => {
    fs.writeFileSync(tmpFile, "---\nstatus: Reading\n---\n# Old\n", "utf-8");
    saveNoteBody(tmpFile, "# New heading\n\nNew body.\n");
    expect(readNoteProperties(tmpFile)).toEqual({ status: "Reading" });
    expect(readNoteBody(tmpFile)).toBe("# New heading\n\nNew body.\n");
  });

  it("saveNoteBody works as a plain overwrite when there is no frontmatter", () => {
    fs.writeFileSync(tmpFile, "# Old\n", "utf-8");
    saveNoteBody(tmpFile, "# New\n");
    const raw = fs.readFileSync(tmpFile, "utf-8");
    expect(raw).toBe("# New\n");
  });
});
