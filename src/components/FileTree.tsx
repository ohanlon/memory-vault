import { stripMdExtension } from "@shared/displayName";
import type { Note } from "@shared/types";

interface Props {
  notes: Note[];
  activePath: string | null;
  onSelect: (note: Note) => void;
  onDelete: (note: Note) => void;
}

export function FileTree({ notes, activePath, onSelect, onDelete }: Props) {
  const sorted = [...notes].sort((a, b) => a.relativePath.localeCompare(b.relativePath));

  return (
    <ul className="file-tree">
      {sorted.map((note) => (
        <li
          key={note.path}
          className={note.path === activePath ? "active" : ""}
        >
          <button className="file-tree-item" onClick={() => onSelect(note)}>
            {stripMdExtension(note.relativePath)}
          </button>
          <button
            className="file-tree-delete"
            title="Delete note"
            onClick={(e) => {
              e.stopPropagation();
              onDelete(note);
            }}
          >
            ×
          </button>
        </li>
      ))}
      {sorted.length === 0 && <li className="file-tree-empty">No notes yet</li>}
    </ul>
  );
}
