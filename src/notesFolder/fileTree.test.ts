import { describe, expect, it } from "vitest";
import type { Note } from "@shared/types";
import { buildFileTree, type FileTreeFolderNode, type FileTreeNode } from "./fileTree";

function makeNote(relativePath: string): Note {
  return {
    path: relativePath,
    title: relativePath.split(/[\\/]/).pop()!.replace(/\.md$/, ""),
    relativePath,
    frontmatter: {},
    tags: [],
    links: [],
    content: "",
    mtimeMs: 0,
  };
}

function names(nodes: FileTreeNode[]): string[] {
  return nodes.map((n) => (n.kind === "folder" ? `${n.name}/` : n.note.title));
}

describe("buildFileTree", () => {
  it("puts a root-level note directly in the top-level list", () => {
    const tree = buildFileTree([makeNote("A.md")]);
    expect(names(tree)).toEqual(["A"]);
  });

  it("groups a nested note under a folder node", () => {
    const tree = buildFileTree([makeNote("Projects/Idea.md")]);
    expect(names(tree)).toEqual(["Projects/"]);
    const folder = tree[0] as FileTreeFolderNode;
    expect(names(folder.children)).toEqual(["Idea"]);
  });

  it("nests multiple levels deep", () => {
    const tree = buildFileTree([makeNote("A/B/C.md")]);
    const a = tree[0] as FileTreeFolderNode;
    expect(a.name).toBe("A");
    expect(a.path).toBe("A");
    const b = a.children[0] as FileTreeFolderNode;
    expect(b.name).toBe("B");
    expect(b.path).toBe("A/B");
    expect(names(b.children)).toEqual(["C"]);
  });

  it("shares one folder node between notes in the same subfolder", () => {
    const tree = buildFileTree([makeNote("Projects/A.md"), makeNote("Projects/B.md")]);
    expect(tree).toHaveLength(1);
    const folder = tree[0] as FileTreeFolderNode;
    expect(names(folder.children)).toEqual(["A", "B"]);
  });

  it("sorts folders before notes at the same level", () => {
    const tree = buildFileTree([makeNote("Zebra.md"), makeNote("Apple/Note.md")]);
    expect(names(tree)).toEqual(["Apple/", "Zebra"]);
  });

  it("sorts folders and notes alphabetically within their own kind", () => {
    const tree = buildFileTree([makeNote("B/x.md"), makeNote("A/x.md"), makeNote("Z.md"), makeNote("A.md")]);
    expect(names(tree)).toEqual(["A/", "B/", "A", "Z"]);
  });

  it("handles a Windows-style backslash relativePath", () => {
    const tree = buildFileTree([makeNote("Projects\\Idea.md")]);
    expect(names(tree)).toEqual(["Projects/"]);
  });

  it("returns an empty array for no notes", () => {
    expect(buildFileTree([])).toEqual([]);
  });

  it("seeds an extra folder with no notes in it", () => {
    const tree = buildFileTree([makeNote("A.md")], ["Empty"]);
    expect(names(tree)).toEqual(["Empty/", "A"]);
    const folder = tree[0] as FileTreeFolderNode;
    expect(folder.children).toEqual([]);
  });

  it("nests an extra folder path multiple levels deep", () => {
    const tree = buildFileTree([], ["A/B"]);
    const a = tree[0] as FileTreeFolderNode;
    expect(a.name).toBe("A");
    const b = a.children[0] as FileTreeFolderNode;
    expect(b.name).toBe("B");
    expect(b.children).toEqual([]);
  });

  it("doesn't duplicate a folder that already exists from a note", () => {
    const tree = buildFileTree([makeNote("Projects/A.md")], ["Projects"]);
    expect(names(tree)).toEqual(["Projects/"]);
    const folder = tree[0] as FileTreeFolderNode;
    expect(names(folder.children)).toEqual(["A"]);
  });

  it("accepts a Windows-style backslash extra folder path", () => {
    const tree = buildFileTree([], ["A\\B"]);
    expect(names(tree)).toEqual(["A/"]);
    const a = tree[0] as FileTreeFolderNode;
    expect(names(a.children)).toEqual(["B/"]);
  });
});
