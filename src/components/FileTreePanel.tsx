import { FileTree } from "./FileTree";
import type { Note } from "@shared/types";

interface Props {
  loading: boolean;
  notes: Note[];
  activePath: string | null;
  renamingPath: string | null;
  onShowInExplorer: (absPath: string) => void;
  onSelect: (note: Note) => void;
  onDelete: (note: Note) => void;
  onRename: (note: Note) => void;
  onCommitNoteRename: (note: Note, newTitle: string) => void;
  onCancelRename: () => void;
  /** Omitted for an open Cairn — seeding starter content only applies to a
   *  single freshly-opened, empty stack. */
  onSeedStarterContent?: () => void;
}

export function FileTreePanel({
  loading,
  notes,
  activePath,
  renamingPath,
  onShowInExplorer,
  onSelect,
  onDelete,
  onRename,
  onCommitNoteRename,
  onCancelRename,
  onSeedStarterContent,
}: Props) {
  return (
    <>
      {loading && <div className="loading">Loading...</div>}
      {!loading && notes.length === 0 && onSeedStarterContent && (
        <div className="sidebar-empty-state">
          <p>This stack has no notes yet.</p>
          <button type="button" onClick={onSeedStarterContent}>
            Add example notes to get started
          </button>
        </div>
      )}
      <FileTree
        notes={notes}
        activePath={activePath}
        renamingPath={renamingPath}
        onShowInExplorer={onShowInExplorer}
        onSelect={onSelect}
        onDelete={onDelete}
        onRename={onRename}
        onCommitNoteRename={onCommitNoteRename}
        onCancelRename={onCancelRename}
      />
    </>
  );
}
