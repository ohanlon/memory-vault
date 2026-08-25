import type { FolderEntry, Note } from "./types";

export interface TreeFolderNode {
  type: "folder";
  name: string;
  /** Absolute path on disk */
  path: string;
  /** Path relative to the vault root ("" for the root itself) */
  relativePath: string;
  children: TreeNode[];
}

export interface TreeNoteNode {
  type: "note";
  note: Note;
}

export type TreeNode = TreeFolderNode | TreeNoteNode;

function segments(relativePath: string): string[] {
  return relativePath.split(/[\\/]/).filter(Boolean);
}

/** Builds a nested folder/note tree from the flat lists a loaded vault provides. */
export function buildFileTree(notes: Note[], folders: FolderEntry[], root: string): TreeFolderNode {
  const rootNode: TreeFolderNode = { type: "folder", name: "", path: root, relativePath: "", children: [] };
  const byRelativePath = new Map<string, TreeFolderNode>([["", rootNode]]);

  const byDepth = [...folders].sort(
    (a, b) => segments(a.relativePath).length - segments(b.relativePath).length
  );
  for (const folder of byDepth) {
    const segs = segments(folder.relativePath);
    const parentPath = segs.slice(0, -1).join("/");
    const parent = byRelativePath.get(parentPath);
    if (!parent) continue; // parent dir missing from the list — shouldn't happen, skip defensively
    const node: TreeFolderNode = {
      type: "folder",
      name: segs[segs.length - 1],
      path: folder.path,
      relativePath: segs.join("/"),
      children: [],
    };
    parent.children.push(node);
    byRelativePath.set(node.relativePath, node);
  }

  for (const note of notes) {
    const segs = segments(note.relativePath);
    const parentPath = segs.slice(0, -1).join("/");
    const parent = byRelativePath.get(parentPath) ?? rootNode;
    parent.children.push({ type: "note", note });
  }

  sortChildren(rootNode);
  return rootNode;
}

function sortChildren(node: TreeFolderNode): void {
  node.children.sort((a, b) => {
    if (a.type !== b.type) return a.type === "folder" ? -1 : 1;
    const nameA = a.type === "folder" ? a.name : a.note.title;
    const nameB = b.type === "folder" ? b.name : b.note.title;
    return nameA.localeCompare(nameB);
  });
  for (const child of node.children) {
    if (child.type === "folder") sortChildren(child);
  }
}

/** True if `descendantPath` is `ancestorPath` itself or nested inside it. */
export function isSameOrDescendant(ancestorPath: string, descendantPath: string): boolean {
  if (ancestorPath === descendantPath) return true;
  const a = ancestorPath.replace(/[\\/]+$/, "");
  return descendantPath.startsWith(a + "/") || descendantPath.startsWith(a + "\\");
}
