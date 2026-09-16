import { FileTree } from "./FileTree";
import type { FileTemplate, Note, StackEntry } from "@shared/types";

interface Props {
  loading: boolean;
  notes: Note[];
  activePath: string | null;
  renamingPath: string | null;
  onShowInExplorer: (absPath: string) => void;
  onSelect: (note: Note) => void;
  onDelete: (note: Note) => void;
  onRename: (note: Note) => void;
  onConvertToTemplate: (note: Note) => void;
  onCommitNoteRename: (note: Note, newTitle: string) => void;
  onCancelRename: () => void;
  /** Omitted for an open merged view — seeding starter content only applies to a
   *  single freshly-opened, empty stack. */
  onSeedStarterContent?: () => void;
  /** Every member stack of an open merged view, for "move to" — omitted for a
   *  plain single-stack session (nothing to move a note to). */
  memberStacks?: StackEntry[];
  onMoveNoteToStack?: (note: Note, destRoot: string) => void;
  templates: FileTemplate[];
  onSelectTemplate: (template: FileTemplate) => void;
  onDeleteTemplate: (template: FileTemplate) => void;
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
  onConvertToTemplate,
  onCommitNoteRename,
  onCancelRename,
  onSeedStarterContent,
  memberStacks,
  onMoveNoteToStack,
  templates,
  onSelectTemplate,
  onDeleteTemplate,
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
        onConvertToTemplate={onConvertToTemplate}
        onCommitNoteRename={onCommitNoteRename}
        onCancelRename={onCancelRename}
        memberStacks={memberStacks}
        onMoveNoteToStack={onMoveNoteToStack}
        templates={templates}
        onSelectTemplate={onSelectTemplate}
        onDeleteTemplate={onDeleteTemplate}
      />
    </>
  );
}
