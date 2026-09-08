import { FileTree, type NavClipboard } from "./FileTree";
import type { FolderEntry, Note } from "@shared/types";

interface Props {
  root: string;
  loading: boolean;
  notes: Note[];
  folders: FolderEntry[];
  activePath: string | null;
  renamingPath: string | null;
  collapsedFolders: string[];
  excludedFolders: string[];
  onToggleFolder: (relativePath: string) => void;
  onToggleExcludeFolder: (folder: FolderEntry) => void;
  onExpandFolders: (relativePaths: string[]) => void;
  onShowInExplorer: (absPath: string) => void;
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
  clipboard: NavClipboard | null;
  onCutNote: (note: Note) => void;
  onCopyNote: (note: Note) => void;
  onCutFolder: (folder: FolderEntry) => void;
  onCopyFolder: (folder: FolderEntry) => void;
  onPasteInto: (destDir: string) => void;
  onSeedStarterContent: () => void;
}

export function FileTreePanel({
  root,
  loading,
  notes,
  folders,
  activePath,
  renamingPath,
  collapsedFolders,
  excludedFolders,
  onToggleFolder,
  onToggleExcludeFolder,
  onExpandFolders,
  onShowInExplorer,
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
  clipboard,
  onCutNote,
  onCopyNote,
  onCutFolder,
  onCopyFolder,
  onPasteInto,
  onSeedStarterContent,
}: Props) {
  return (
    <>
      {loading && <div className="loading">Loading...</div>}
      {!loading && notes.length === 0 && (
        <div className="sidebar-empty-state">
          <p>This stack has no notes yet.</p>
          <button type="button" onClick={onSeedStarterContent}>
            Add example notes to get started
          </button>
        </div>
      )}
      <FileTree
        root={root}
        notes={notes}
        folders={folders}
        activePath={activePath}
        renamingPath={renamingPath}
        collapsedFolders={collapsedFolders}
        excludedFolders={excludedFolders}
        onToggleFolder={onToggleFolder}
        onToggleExcludeFolder={onToggleExcludeFolder}
        onExpandFolders={onExpandFolders}
        onShowInExplorer={onShowInExplorer}
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
        clipboard={clipboard}
        onCutNote={onCutNote}
        onCopyNote={onCopyNote}
        onCutFolder={onCutFolder}
        onCopyFolder={onCopyFolder}
        onPasteInto={onPasteInto}
      />
    </>
  );
}
