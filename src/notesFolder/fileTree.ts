import type { Note } from "@shared/types";

// Groups a flat Note[] (as loaded from disk - see electron/notesFolder.ts)
// into a folder hierarchy for FileTree.tsx to render, since a note's
// subfolder (get_notes --subfolders / add_note --subfolder can put one
// anywhere on disk) previously had no visual representation at all - the
// sidebar showed every note in one flat list regardless of where it lived.

export interface FileTreeFolderNode {
  kind: "folder";
  /** This folder's own name (not the full path). */
  name: string;
  /** Path from the notes folder root to this folder, e.g. "Projects/Sub". */
  path: string;
  children: FileTreeNode[];
}

export interface FileTreeNoteNode {
  kind: "note";
  note: Note;
}

export type FileTreeNode = FileTreeFolderNode | FileTreeNoteNode;

function sortChildren(children: FileTreeNode[]): void {
  children.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === "folder" ? -1 : 1;
    const nameA = a.kind === "folder" ? a.name : a.note.title;
    const nameB = b.kind === "folder" ? b.name : b.note.title;
    return nameA.localeCompare(nameB);
  });
  for (const child of children) {
    if (child.kind === "folder") sortChildren(child.children);
  }
}

/** Builds a folder tree from every note's relativePath - folders before notes at each level, both alphabetical. */
export function buildFileTree(notes: Note[]): FileTreeNode[] {
  const root: FileTreeFolderNode = { kind: "folder", name: "", path: "", children: [] };

  for (const note of notes) {
    const parts = note.relativePath.replace(/\\/g, "/").split("/");
    parts.pop(); // the file name itself, not a folder segment

    let current = root;
    let currentPath = "";
    for (const part of parts) {
      currentPath = currentPath ? `${currentPath}/${part}` : part;
      let folder = current.children.find(
        (c): c is FileTreeFolderNode => c.kind === "folder" && c.name === part
      );
      if (!folder) {
        folder = { kind: "folder", name: part, path: currentPath, children: [] };
        current.children.push(folder);
      }
      current = folder;
    }
    current.children.push({ kind: "note", note });
  }

  sortChildren(root.children);
  return root.children;
}
