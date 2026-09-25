import { FileTree } from "./FileTree";
import type { FileTemplate, Note } from "@shared/types";

interface Props {
  loading: boolean;
  notes: Note[];
  /** Relative paths ("/"-separated) of folders with no notes in them yet — see fileTree.ts's buildFileTree. */
  emptyFolderPaths?: string[];
  activePath: string | null;
  renamingPath: string | null;
  /** The folder path ("/"-separated, relative) currently selected as the target for "New Note" — see App.tsx. */
  selectedFolderPath: string | null;
  onSelectFolder: (path: string) => void;
  onShowInExplorer: (absPath: string) => void;
  onSelect: (note: Note) => void;
  onDelete: (note: Note) => void;
  onRename: (note: Note) => void;
  onConvertToTemplate: (note: Note) => void;
  onCommitNoteRename: (note: Note, newTitle: string) => void;
  onCancelRename: () => void;
  /** Create a new folder nested at the same depth as `note`. */
  onNewFolder: (note: Note) => void;
  /** The folder path ("/"-separated, relative) currently being renamed inline — e.g. right after "New Folder". */
  renamingFolderPath: string | null;
  onCommitFolderRename: (folderPath: string, newName: string) => void;
  onCancelFolderRename: () => void;
  /** Drag-and-drop a note onto a folder row to move it there. */
  onMoveNoteToFolder: (note: Note, folderPath: string) => void;
  onSeedStarterContent?: () => void;
  templates: FileTemplate[];
  onSelectTemplate: (template: FileTemplate) => void;
  onDeleteTemplate: (template: FileTemplate) => void;
}

export function FileTreePanel({
  loading,
  notes,
  emptyFolderPaths,
  activePath,
  renamingPath,
  selectedFolderPath,
  onSelectFolder,
  onShowInExplorer,
  onSelect,
  onDelete,
  onRename,
  onConvertToTemplate,
  onCommitNoteRename,
  onCancelRename,
  onNewFolder,
  renamingFolderPath,
  onCommitFolderRename,
  onCancelFolderRename,
  onMoveNoteToFolder,
  onSeedStarterContent,
  templates,
  onSelectTemplate,
  onDeleteTemplate,
}: Props) {
  return (
    <>
      {loading && <div className="loading">Loading...</div>}
      {!loading && notes.length === 0 && onSeedStarterContent && (
        <div className="sidebar-empty-state">
          <p>This notes folder has no notes yet.</p>
          <button type="button" onClick={onSeedStarterContent}>
            Add example notes to get started
          </button>
        </div>
      )}
      <FileTree
        notes={notes}
        emptyFolderPaths={emptyFolderPaths}
        activePath={activePath}
        renamingPath={renamingPath}
        selectedFolderPath={selectedFolderPath}
        onSelectFolder={onSelectFolder}
        onShowInExplorer={onShowInExplorer}
        onSelect={onSelect}
        onDelete={onDelete}
        onRename={onRename}
        onConvertToTemplate={onConvertToTemplate}
        onCommitNoteRename={onCommitNoteRename}
        onCancelRename={onCancelRename}
        onNewFolder={onNewFolder}
        renamingFolderPath={renamingFolderPath}
        onCommitFolderRename={onCommitFolderRename}
        onCancelFolderRename={onCancelFolderRename}
        onMoveNoteToFolder={onMoveNoteToFolder}
        templates={templates}
        onSelectTemplate={onSelectTemplate}
        onDeleteTemplate={onDeleteTemplate}
      />
    </>
  );
}
