import { FileTree } from "./FileTree";
import type { FolderEntry, Note } from "@shared/types";

interface Props {
  root: string;
  loading: boolean;
  notes: Note[];
  folders: FolderEntry[];
  activePath: string | null;
  renamingPath: string | null;
  collapsedFolders: string[];
  onToggleFolder: (relativePath: string) => void;
  onExpandFolders: (relativePaths: string[]) => void;
  onSelect: (note: Note) => void;
  onDelete: (note: Note) => void;
  onRename: (note: Note) => void;
  onRenameFolder: (folder: FolderEntry) => void;
  onCommitNoteRename: (note: Note, newTitle: string) => void;
  onCommitFolderRename: (folder: FolderEntry, newName: string) => void;
  onCancelRename: () => void;
  onNewNoteInFolder: (dir: string) => void;
  onNewFolderInFolder: (dir: string) => void;
  onDeleteFolder: (folder: FolderEntry) => void;
  onMoveNote: (notePath: string, destDir: string) => void;
  onMoveFolder: (folderPath: string, destDir: string) => void;
}

export function FileTreePanel({
  root,
  loading,
  notes,
  folders,
  activePath,
  renamingPath,
  collapsedFolders,
  onToggleFolder,
  onExpandFolders,
  onSelect,
  onDelete,
  onRename,
  onRenameFolder,
  onCommitNoteRename,
  onCommitFolderRename,
  onCancelRename,
  onNewNoteInFolder,
  onNewFolderInFolder,
  onDeleteFolder,
  onMoveNote,
  onMoveFolder,
}: Props) {
  return (
    <>
      {loading && <div className="loading">Loading...</div>}
      <FileTree
        root={root}
        notes={notes}
        folders={folders}
        activePath={activePath}
        renamingPath={renamingPath}
        collapsedFolders={collapsedFolders}
        onToggleFolder={onToggleFolder}
        onExpandFolders={onExpandFolders}
        onSelect={onSelect}
        onDelete={onDelete}
        onRename={onRename}
        onRenameFolder={onRenameFolder}
        onCommitNoteRename={onCommitNoteRename}
        onCommitFolderRename={onCommitFolderRename}
        onCancelRename={onCancelRename}
        onNewNoteInFolder={onNewNoteInFolder}
        onNewFolderInFolder={onNewFolderInFolder}
        onDeleteFolder={onDeleteFolder}
        onMoveNote={onMoveNote}
        onMoveFolder={onMoveFolder}
      />
    </>
  );
}
