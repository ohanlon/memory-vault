import { stripMdExtension } from "@shared/displayName";
import type { Note } from "@shared/types";

interface Props {
  tabs: Note[];
  activePath: string | null;
  onSelect: (path: string) => void;
  onClose: (path: string) => void;
}

export function TabBar({ tabs, activePath, onSelect, onClose }: Props) {
  if (tabs.length === 0) return null;

  return (
    <div className="tab-bar">
      {tabs.map((note) => (
        <div
          key={note.path}
          className={`tab${note.path === activePath ? " active" : ""}`}
          onClick={() => onSelect(note.path)}
        >
          <span className="tab-label">{stripMdExtension(note.relativePath)}</span>
          <button
            className="tab-close"
            title="Close tab"
            onClick={(e) => {
              e.stopPropagation();
              onClose(note.path);
            }}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
