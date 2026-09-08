import { useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import type { Note } from "@shared/types";
import { findDuplicateTitles } from "@shared/duplicateTitles";
import { pluginRegistry } from "../plugins/registry";
import { pushToPlugin } from "../plugins/pluginFrameRegistry";
import { ContextMenu, type ContextMenuEntry } from "./ContextMenu";
import { DeleteIcon, OpenInExplorerIcon, RenameIcon } from "./icons";

interface Props {
  notes: Note[];
  activePath: string | null;
  renamingPath: string | null;
  onSelect: (note: Note) => void;
  onDelete: (note: Note) => void;
  onRename: (note: Note) => void;
  onCommitNoteRename: (note: Note, newTitle: string) => void;
  onCancelRename: () => void;
  onShowInExplorer: (absPath: string) => void;
}

type ContextMenuState = { note: Note; x: number; y: number };

// Plugin-contributed context-menu entries for a note, hidden entirely when
// the owning plugin has no live iframe mounted (see pluginFrameRegistry.ts)
// — the item would otherwise silently do nothing.
function pluginContextMenuEntries(targetPath: string): ContextMenuEntry[] {
  const items = pluginRegistry.getContextMenuItems("note").filter((item) => pluginRegistry.hasLiveFrame(item.pluginId));
  if (items.length === 0) return [];
  return [
    { separator: true as const },
    ...items.map((item) => ({
      label: item.label,
      onClick: () =>
        pushToPlugin(item.pluginId, {
          channel: "cairn-plugin-rpc" as const,
          kind: "push" as const,
          event: "contextMenuAction" as const,
          itemId: item.id,
          targetPath,
        }),
    })),
  ];
}

interface EditableLabelProps {
  initialValue: string;
  className: string;
  onCommit: (value: string) => void;
  onCancel: () => void;
}

function EditableLabel({ initialValue, className, onCommit, onCancel }: EditableLabelProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const doneRef = useRef(false);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  function commit() {
    if (doneRef.current) return;
    doneRef.current = true;
    onCommit(inputRef.current?.value.trim() ?? "");
  }

  function cancel() {
    if (doneRef.current) return;
    doneRef.current = true;
    onCancel();
  }

  return (
    <input
      ref={inputRef}
      className={className}
      defaultValue={initialValue}
      onBlur={commit}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          commit();
        } else if (e.key === "Escape") {
          e.preventDefault();
          cancel();
        }
      }}
    />
  );
}

export function FileTree({
  notes,
  activePath,
  renamingPath,
  onSelect,
  onDelete,
  onRename,
  onCommitNoteRename,
  onCancelRename,
  onShowInExplorer,
}: Props) {
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);

  const sorted = useMemo(() => [...notes].sort((a, b) => a.title.localeCompare(b.title)), [notes]);

  // Titles that appear on more than one note — shown with their relative
  // path as a disambiguating hint, since the list is otherwise flat.
  const duplicateTitles = useMemo(() => findDuplicateTitles(notes), [notes]);

  return (
    <>
      <ul className="file-tree" tabIndex={0}>
        {sorted.map((note) => {
          if (note.path === renamingPath) {
            return (
              <li key={note.path} className={note.path === activePath ? "active" : ""}>
                <EditableLabel
                  className="file-tree-item file-tree-item-edit"
                  initialValue={note.title}
                  onCommit={(value) => onCommitNoteRename(note, value)}
                  onCancel={onCancelRename}
                />
              </li>
            );
          }
          return (
            <li key={note.path} className={note.path === activePath ? "active" : ""}>
              <button
                className="file-tree-item"
                onClick={() => onSelect(note)}
                onContextMenu={(e) => {
                  e.preventDefault();
                  setContextMenu({ note, x: e.clientX, y: e.clientY });
                }}
                onKeyDown={(e: KeyboardEvent) => {
                  if (e.key === "F2") {
                    e.preventDefault();
                    onRename(note);
                    return;
                  }
                  if (e.key !== "Delete") return;
                  e.preventDefault();
                  onDelete(note);
                }}
              >
                <span className="file-tree-item-title">{note.title}</span>
                {duplicateTitles.has(note.title) && (
                  <span className="file-tree-item-hint">{note.relativePath}</span>
                )}
              </button>
            </li>
          );
        })}
        {sorted.length === 0 && <li className="file-tree-empty">No notes yet</li>}
      </ul>
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={[
            { label: "Rename", shortcut: "F2", icon: <RenameIcon />, onClick: () => onRename(contextMenu.note) },
            { label: "Delete", shortcut: "Del", icon: <DeleteIcon />, onClick: () => onDelete(contextMenu.note) },
            ...pluginContextMenuEntries(contextMenu.note.relativePath),
            { separator: true as const },
            {
              label: "Open in explorer",
              icon: <OpenInExplorerIcon />,
              onClick: () => onShowInExplorer(contextMenu.note.path),
            },
          ]}
          onClose={() => setContextMenu(null)}
        />
      )}
    </>
  );
}
