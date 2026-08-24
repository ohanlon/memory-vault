import { FileTree } from "./FileTree";
import type { Note } from "@shared/types";

interface Props {
  root: string;
  activeName: string | null;
  loading: boolean;
  notes: Note[];
  activePath: string | null;
  onSelect: (note: Note) => void;
  onDelete: (note: Note) => void;
  onSwitchVault: () => void;
}

export function FileTreePanel({
  root,
  activeName,
  loading,
  notes,
  activePath,
  onSelect,
  onDelete,
  onSwitchVault,
}: Props) {
  return (
    <>
      <div className="sidebar-header">
        <span title={root}>{activeName ?? root.split(/[\\/]/).pop()}</span>
        <button onClick={onSwitchVault} title="Switch to a different vault">
          Switch
        </button>
      </div>
      {loading && <div className="loading">Loading...</div>}
      <FileTree notes={notes} activePath={activePath} onSelect={onSelect} onDelete={onDelete} />
    </>
  );
}
