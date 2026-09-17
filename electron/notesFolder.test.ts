import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadNotesFolder, reconcileNotesFolderCache } from "./notesFolder";
import type { Note } from "../shared/types";

describe("loadNotesFolder", () => {
  const root = path.join(os.tmpdir(), `notes-folder-load-test-${process.pid}`);

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  function write(relativePath: string, content = "hello"): void {
    const full = path.join(root, relativePath);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content, "utf-8");
  }

  function byRelPath(notes: Note[]): Map<string, Note> {
    return new Map(notes.map((n) => [n.relativePath, n]));
  }

  it("parses every note when no previous map is given", async () => {
    write("a.md", "# A");
    write("sub/b.md", "# B");

    const notes = await loadNotesFolder(root);

    expect(notes.map((n) => n.relativePath).sort()).toEqual(["a.md", path.join("sub", "b.md")]);
  });

  it("reuses the previous Note as-is when a file's mtime is unchanged", async () => {
    write("a.md", "# Original");
    const first = await loadNotesFolder(root);

    // Untouched since the first load, so its mtime matches previous exactly
    // — loadNotesFolder should skip re-reading/re-parsing it and return the
    // same Note object.
    const second = await loadNotesFolder(root, byRelPath(first));

    expect(second[0]).toBe(first[0]);
  });

  it("re-parses a file whose mtime changed", async () => {
    write("a.md", "# Original");
    const first = await loadNotesFolder(root);

    await new Promise((resolve) => setTimeout(resolve, 5));
    write("a.md", "# Changed");
    fs.utimesSync(path.join(root, "a.md"), new Date(), new Date());

    const second = await loadNotesFolder(root, byRelPath(first));

    expect(second[0]).not.toBe(first[0]);
    expect(second[0].content).toContain("Changed");
  });

  it("drops files that were removed from disk", async () => {
    write("a.md");
    write("b.md");
    const first = await loadNotesFolder(root);

    fs.rmSync(path.join(root, "b.md"));

    const second = await loadNotesFolder(root, byRelPath(first));

    expect(second.map((n) => n.relativePath)).toEqual(["a.md"]);
  });
});

describe("reconcileNotesFolderCache", () => {
  const root = path.join(os.tmpdir(), `notes-folder-reconcile-test-${process.pid}`);

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  function write(relativePath: string, content = "hello"): void {
    const full = path.join(root, relativePath);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content, "utf-8");
  }

  it("returns null and does not write a cache file when nothing changed", async () => {
    write("a.md");
    const notes = await loadNotesFolder(root);

    const result = await reconcileNotesFolderCache(root, notes);

    expect(result).toBeNull();
    expect(fs.existsSync(path.join(root, ".cairn", "index.json"))).toBe(false);
  });

  it("returns the reconciled result and writes the cache when a file changed", async () => {
    write("a.md", "# Original");
    const notes = await loadNotesFolder(root);

    await new Promise((resolve) => setTimeout(resolve, 5));
    write("a.md", "# Changed");
    fs.utimesSync(path.join(root, "a.md"), new Date(), new Date());

    const result = await reconcileNotesFolderCache(root, notes);

    expect(result).not.toBeNull();
    expect(result?.notes[0].content).toContain("Changed");
    expect(fs.existsSync(path.join(root, ".cairn", "index.json"))).toBe(true);
  });
});
