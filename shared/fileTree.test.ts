import { describe, expect, it } from "vitest";
import { buildFileTree, isSameOrDescendant } from "./fileTree";
import type { FolderEntry, Note } from "./types";

function note(relativePath: string): Note {
  return {
    path: `/stack/${relativePath}`,
    title: relativePath.split(/[\\/]/).pop()!.replace(/\.md$/, ""),
    relativePath,
    frontmatter: {},
    tags: [],
    links: [],
    content: "",
    mtimeMs: 0,
  };
}

function folder(relativePath: string): FolderEntry {
  return { path: `/stack/${relativePath}`, relativePath };
}

describe("buildFileTree", () => {
  it("nests notes under their parent folders", () => {
    const tree = buildFileTree(
      [note("Root.md"), note("Work/Project.md"), note("Work/Sub/Deep.md")],
      [folder("Work"), folder("Work/Sub")],
      "/stack"
    );

    expect(tree.children.map((c) => (c.type === "folder" ? c.name : c.note.title))).toEqual([
      "Work",
      "Root",
    ]);
    const work = tree.children[0];
    if (work.type !== "folder") throw new Error("expected folder");
    expect(work.children.map((c) => (c.type === "folder" ? c.name : c.note.title))).toEqual([
      "Sub",
      "Project",
    ]);
    const sub = work.children[0];
    if (sub.type !== "folder") throw new Error("expected folder");
    expect(sub.children).toHaveLength(1);
    expect(sub.relativePath).toBe("Work/Sub");
  });

  it("includes empty folders with no notes", () => {
    const tree = buildFileTree([], [folder("Empty")], "/stack");
    expect(tree.children).toHaveLength(1);
    expect(tree.children[0]).toMatchObject({ type: "folder", name: "Empty", children: [] });
  });

  it("sorts folders before notes, alphabetically within each group", () => {
    const tree = buildFileTree(
      [note("Zeta.md"), note("Alpha.md")],
      [folder("Beta"), folder("Alpha-folder")],
      "/stack"
    );
    expect(tree.children.map((c) => (c.type === "folder" ? c.name : c.note.title))).toEqual([
      "Alpha-folder",
      "Beta",
      "Alpha",
      "Zeta",
    ]);
  });
});

describe("isSameOrDescendant", () => {
  it("is true for the same path", () => {
    expect(isSameOrDescendant("/stack/Work", "/stack/Work")).toBe(true);
  });

  it("is true for a nested descendant", () => {
    expect(isSameOrDescendant("/stack/Work", "/stack/Work/Sub")).toBe(true);
  });

  it("is false for an unrelated path, including a sibling with a shared prefix", () => {
    expect(isSameOrDescendant("/stack/Work", "/stack/WorkOther")).toBe(false);
    expect(isSameOrDescendant("/stack/Work", "/stack/Other")).toBe(false);
  });
});
