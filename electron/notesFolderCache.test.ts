import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { notesFolderCacheFilePath, readNotesFolderCache, writeNotesFolderCache } from "./notesFolderCache";

describe("readNotesFolderCache / writeNotesFolderCache", () => {
  const root = path.join(os.tmpdir(), `notes-folder-cache-test-${process.pid}`);

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("returns null when the file does not exist", () => {
    expect(readNotesFolderCache(root)).toBeNull();
  });

  it("creates the .cairn directory on first write", () => {
    expect(fs.existsSync(path.join(root, ".cairn"))).toBe(false);
    writeNotesFolderCache(root, { notes: [] });
    expect(fs.existsSync(notesFolderCacheFilePath(root))).toBe(true);
  });

  it("round-trips notes through disk", () => {
    const cache = {
      notes: [
        {
          path: path.join(root, "a.md"),
          title: "a",
          relativePath: "a.md",
          frontmatter: {},
          tags: [],
          links: [],
          content: "hello",
          mtimeMs: 123,
        },
      ],
    };
    writeNotesFolderCache(root, cache);
    expect(readNotesFolderCache(root)).toEqual(cache);
  });

  it("returns null for corrupt JSON instead of throwing", () => {
    fs.mkdirSync(path.join(root, ".cairn"), { recursive: true });
    fs.writeFileSync(notesFolderCacheFilePath(root), "{not valid json", "utf-8");
    expect(readNotesFolderCache(root)).toBeNull();
  });

  it("returns null for a malformed shape", () => {
    fs.mkdirSync(path.join(root, ".cairn"), { recursive: true });
    fs.writeFileSync(notesFolderCacheFilePath(root), JSON.stringify({ notes: "not an array" }), "utf-8");
    expect(readNotesFolderCache(root)).toBeNull();
  });
});
