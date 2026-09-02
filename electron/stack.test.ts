import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { listDirChildren } from "./stack";

describe("listDirChildren", () => {
  const root = path.join(os.tmpdir(), `stack-list-dir-children-test-${process.pid}`);

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  function write(relativePath: string, content = "hello"): void {
    const full = path.join(root, relativePath);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content, "utf-8");
  }

  it("lists only the immediate children of the given directory", async () => {
    write("root-note.md");
    write("sub/nested-note.md");
    fs.mkdirSync(path.join(root, "empty-sub"), { recursive: true });

    const { folders, notes } = await listDirChildren(root, root);

    expect(folders.map((f) => f.relativePath).sort()).toEqual(["empty-sub", "sub"]);
    expect(notes.map((n) => n.relativePath)).toEqual(["root-note.md"]);
  });

  it("does not recurse into subfolders", async () => {
    write("sub/nested-note.md");
    write("sub/deeper/deep-note.md");

    const { folders, notes } = await listDirChildren(root, path.join(root, "sub"));

    expect(folders.map((f) => f.relativePath)).toEqual([path.join("sub", "deeper")]);
    expect(notes.map((n) => n.relativePath)).toEqual([path.join("sub", "nested-note.md")]);
  });

  it("excludes dotfolders and dotfiles", async () => {
    write(".cairn/workspace.json", "{}");
    write(".hidden-note.md");
    write("visible-note.md");

    const { folders, notes } = await listDirChildren(root, root);

    expect(folders).toEqual([]);
    expect(notes.map((n) => n.relativePath)).toEqual(["visible-note.md"]);
  });

  it("ignores non-markdown files", async () => {
    write("notes.txt");
    write("real-note.md");

    const { notes } = await listDirChildren(root, root);

    expect(notes.map((n) => n.relativePath)).toEqual(["real-note.md"]);
  });

  it("treats a directory whose name ends in .md as a folder, not a note", async () => {
    fs.mkdirSync(path.join(root, "weird.md"), { recursive: true });

    const { folders, notes } = await listDirChildren(root, root);

    expect(folders.map((f) => f.relativePath)).toEqual(["weird.md"]);
    expect(notes).toEqual([]);
  });
});
