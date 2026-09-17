import { FileTree } from "./FileTree";
import type { FileTemplate, Note } from "@shared/types";

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
  onSeedStarterContent?: () => void;
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
        activePath={activePath}
        renamingPath={renamingPath}
        onShowInExplorer={onShowInExplorer}
        onSelect={onSelect}
        onDelete={onDelete}
        onRename={onRename}
        onConvertToTemplate={onConvertToTemplate}
        onCommitNoteRename={onCommitNoteRename}
        onCancelRename={onCancelRename}
        templates={templates}
        onSelectTemplate={onSelectTemplate}
        onDeleteTemplate={onDeleteTemplate}
      />
    </>
  );
}
