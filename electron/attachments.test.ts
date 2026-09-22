import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { deleteAttachments, findOrphanedAttachments, saveAttachment } from "./attachments";
import type { Note } from "../shared/types";

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "cairn-attachments-test-"));
let counter = 0;
function tmpDir(): string {
  counter += 1;
  return path.join(tmpRoot, `case-${counter}`);
}

function makeNote(relativePath: string, content: string): Note {
  return {
    path: relativePath,
    title: relativePath.replace(/\.md$/, ""),
    relativePath,
    frontmatter: {},
    tags: [],
    links: [],
    content,
    mtimeMs: 0,
  };
}

afterEach(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
  fs.mkdirSync(tmpRoot, { recursive: true });
  counter = 0;
});

describe("saveAttachment", () => {
  it("creates the attachments folder and writes the file under it", () => {
    const root = tmpDir();
    fs.mkdirSync(root, { recursive: true });

    const relPath = saveAttachment(root, "foo.png", Buffer.from("data"));

    expect(relPath).toBe("attachments/foo.png");
    expect(fs.readFileSync(path.join(root, "attachments", "foo.png"))).toEqual(Buffer.from("data"));
  });

  it("auto-renames on a filename collision instead of overwriting", () => {
    const root = tmpDir();
    fs.mkdirSync(root, { recursive: true });

    saveAttachment(root, "foo.png", Buffer.from("first"));
    const second = saveAttachment(root, "foo.png", Buffer.from("second"));

    expect(second).toBe("attachments/foo 1.png");
    expect(fs.readFileSync(path.join(root, "attachments", "foo.png"))).toEqual(Buffer.from("first"));
    expect(fs.readFileSync(path.join(root, "attachments", "foo 1.png"))).toEqual(Buffer.from("second"));
  });

  it("returns a posix-separated relative path even conceptually nested", () => {
    const root = tmpDir();
    fs.mkdirSync(root, { recursive: true });

    const relPath = saveAttachment(root, "image.jpg", Buffer.from("x"));

    expect(relPath).not.toContain("\\");
  });
});

describe("findOrphanedAttachments", () => {
  it("returns nothing when every attachment is referenced", () => {
    const root = tmpDir();
    fs.mkdirSync(root, { recursive: true });
    saveAttachment(root, "foo.png", Buffer.from("x"));
    const notes = [makeNote("Note.md", "![alt](attachments/foo.png)")];

    expect(findOrphanedAttachments(root, notes)).toEqual([]);
  });

  it("reports an attachment no note references", () => {
    const root = tmpDir();
    fs.mkdirSync(root, { recursive: true });
    saveAttachment(root, "foo.png", Buffer.from("x"));
    const notes = [makeNote("Note.md", "no images here")];

    expect(findOrphanedAttachments(root, notes)).toEqual(["attachments/foo.png"]);
  });

  it("resolves a reference from a note nested in a subfolder", () => {
    const root = tmpDir();
    fs.mkdirSync(root, { recursive: true });
    saveAttachment(root, "foo.png", Buffer.from("x"));
    const notes = [makeNote("Projects/Note.md", "![alt](../attachments/foo.png)")];

    expect(findOrphanedAttachments(root, notes)).toEqual([]);
  });

  it("doesn't let an external image URL count as a reference to a same-named local file", () => {
    const root = tmpDir();
    fs.mkdirSync(root, { recursive: true });
    saveAttachment(root, "foo.png", Buffer.from("x"));
    const notes = [makeNote("Note.md", "![alt](https://example.com/attachments/foo.png)")];

    expect(findOrphanedAttachments(root, notes)).toEqual(["attachments/foo.png"]);
  });

  it("returns an empty array when there's no attachments folder yet", () => {
    const root = tmpDir();
    fs.mkdirSync(root, { recursive: true });

    expect(findOrphanedAttachments(root, [])).toEqual([]);
  });
});

describe("deleteAttachments", () => {
  it("deletes the given files", () => {
    const root = tmpDir();
    fs.mkdirSync(root, { recursive: true });
    saveAttachment(root, "foo.png", Buffer.from("x"));

    deleteAttachments(root, ["attachments/foo.png"]);

    expect(fs.existsSync(path.join(root, "attachments", "foo.png"))).toBe(false);
  });

  it("silently ignores a path that no longer exists", () => {
    const root = tmpDir();
    fs.mkdirSync(root, { recursive: true });

    expect(() => deleteAttachments(root, ["attachments/missing.png"])).not.toThrow();
  });

  it("refuses to delete a path that escapes root", () => {
    const root = tmpDir();
    const outside = tmpDir();
    fs.mkdirSync(root, { recursive: true });
    fs.mkdirSync(outside, { recursive: true });
    const victim = path.join(outside, "victim.txt");
    fs.writeFileSync(victim, "keep me", "utf-8");

    deleteAttachments(root, [path.relative(root, victim)]);

    expect(fs.existsSync(victim)).toBe(true);
  });
});
