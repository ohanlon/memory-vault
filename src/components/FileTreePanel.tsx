import { FileTree } from "./FileTree";
import type { Note, StackEntry } from "@shared/types";

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
  /** Every member stack of an open Cairn, for "move to" — omitted for a
   *  plain single-stack session (nothing to move a note to). */
  memberStacks?: StackEntry[];
  onMoveNoteToStack?: (note: Note, destRoot: string) => void;
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
  memberStacks,
  onMoveNoteToStack,
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
        memberStacks={memberStacks}
        onMoveNoteToStack={onMoveNoteToStack}
      />
    </>
  );
}
