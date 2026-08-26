import { FileTree } from "./FileTree";
import type { FolderEntry, Note } from "@shared/types";

interface Props {
  root: string;
  activeName: string | null;
  loading: boolean;
  notes: Note[];
  folders: FolderEntry[];
  activePath: string | null;
  onSelect: (note: Note) => void;
  onDelete: (note: Note) => void;
  onRename: (note: Note) => void;
  onNewNoteInFolder: (dir: string) => void;
  onNewFolderInFolder: (dir: string) => void;
  onDeleteFolder: (folder: FolderEntry) => void;
  onMoveNote: (notePath: string, destDir: string) => void;
  onMoveFolder: (folderPath: string, destDir: string) => void;
  onSwitchVault: () => void;
}

export function FileTreePanel({
  root,
  activeName,
  loading,
  notes,
  folders,
  activePath,
  onSelect,
  onDelete,
  onRename,
  onNewNoteInFolder,
  onNewFolderInFolder,
  onDeleteFolder,
  onMoveNote,
  onMoveFolder,
  onSwitchVault,
}: Props) {
  return (
    <>
      {loading && <div className="loading">Loading...</div>}
      <FileTree
        root={root}
        notes={notes}
        folders={folders}
        activePath={activePath}
        onSelect={onSelect}
        onDelete={onDelete}
        onRename={onRename}
        onNewNoteInFolder={onNewNoteInFolder}
        onNewFolderInFolder={onNewFolderInFolder}
        onDeleteFolder={onDeleteFolder}
        onMoveNote={onMoveNote}
        onMoveFolder={onMoveFolder}
      />
      <div className="sidebar-header">
        <span title={root}>{activeName ?? root.split(/[\\/]/).pop()}</span>
        <button onClick={onSwitchVault} title="Switch to a different vault">
          Switch
        </button>
      </div>
    </>
  );
}
