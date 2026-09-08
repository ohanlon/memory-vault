import { useEffect, useMemo, useRef, useState } from "react";
import type { DragEvent, KeyboardEvent, ReactNode } from "react";
import type { Note, StackEntry } from "@shared/types";
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
  /** Every member stack of an open Cairn, for "move to" — omitted for a
   *  plain single-stack session (nothing to move a note to). */
  memberStacks?: StackEntry[];
  onMoveNoteToStack?: (note: Note, destRoot: string) => void;
}

type ContextMenuState = { note: Note; x: number; y: number };

const NOTE_DRAG_TYPE = "application/x-cairn-note";

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
  memberStacks,
  onMoveNoteToStack,
}: Props) {
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  // Which source-stack groups are collapsed — only relevant for an open
  // Cairn (see groupedByStack below); session-local, not persisted.
  const [collapsedStacks, setCollapsedStacks] = useState<Set<string>>(new Set());
  // Which stack group a dragged note is currently over, for drop-target
  // highlighting — only relevant for an open Cairn.
  const [dragOverStack, setDragOverStack] = useState<string | null>(null);

  const sorted = useMemo(() => [...notes].sort((a, b) => a.title.localeCompare(b.title)), [notes]);

  // Titles that appear on more than one note — shown with their relative
  // path as a disambiguating hint, since the list is otherwise flat.
  const duplicateTitles = useMemo(() => findDuplicateTitles(notes), [notes]);

  // An open Cairn stamps every note with its origin stack — group by that
  // to simulate the folder-like separation a single stack no longer has,
  // one collapsible section per member stack. A plain single-stack session
  // has no sourceStack on any note, so this is a no-op there (flat list,
  // unchanged from before).
  const groupedByStack = useMemo(() => {
    const groups = new Map<string, Note[]>();
    for (const note of sorted) {
      if (!note.sourceStack) continue;
      const group = groups.get(note.sourceStack);
      if (group) group.push(note);
      else groups.set(note.sourceStack, [note]);
    }
    return groups;
  }, [sorted]);

  // Every note carries a sourceStack in an open Cairn, none does in a plain
  // single-stack session — this is enough to tell the two apart.
  const isGrouped = sorted.length > 0 && sorted.every((n) => n.sourceStack !== undefined);
  const canMove = isGrouped && !!memberStacks && !!onMoveNoteToStack;

  function toggleStack(stackName: string) {
    setCollapsedStacks((prev) => {
      const next = new Set(prev);
      if (next.has(stackName)) next.delete(stackName);
      else next.add(stackName);
      return next;
    });
  }

  function acceptsNoteDrag(e: DragEvent) {
    return e.dataTransfer.types.includes(NOTE_DRAG_TYPE);
  }

  function handleDropOnStack(e: DragEvent, stackName: string) {
    e.preventDefault();
    e.stopPropagation();
    setDragOverStack(null);
    if (!canMove) return;
    const notePath = e.dataTransfer.getData(NOTE_DRAG_TYPE);
    const note = notes.find((n) => n.path === notePath);
    if (!note || note.sourceStack === stackName) return;
    const destStack = memberStacks!.find((s) => s.name === stackName);
    if (destStack) onMoveNoteToStack!(note, destStack.root);
  }

  function moveToMenuEntries(note: Note): ContextMenuEntry[] {
    if (!canMove) return [];
    const targets = memberStacks!.filter((s) => s.name !== note.sourceStack);
    if (targets.length === 0) return [];
    return [
      {
        label: "Move to",
        children: targets.map((stack) => ({
          label: stack.name,
          onClick: () => onMoveNoteToStack!(note, stack.root),
        })),
      },
    ];
  }

  function renderNoteRow(note: Note, indented: boolean): ReactNode {
    if (note.path === renamingPath) {
      return (
        <li key={note.path} className={note.path === activePath ? "active" : ""}>
          <EditableLabel
            className={`file-tree-item file-tree-item-edit${indented ? " file-tree-item-indented" : ""}`}
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
          className={`file-tree-item${indented ? " file-tree-item-indented" : ""}`}
          draggable={canMove}
          onDragStart={(e) => {
            if (!canMove) return;
            e.dataTransfer.setData(NOTE_DRAG_TYPE, note.path);
            e.dataTransfer.effectAllowed = "move";
          }}
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
            <span className="file-tree-item-hint">
              {note.sourceStack ? `${note.sourceStack}/${note.relativePath}` : note.relativePath}
            </span>
          )}
        </button>
      </li>
    );
  }

  return (
    <>
      <ul className="file-tree" tabIndex={0}>
        {isGrouped
          ? [...groupedByStack.entries()]
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([stackName, stackNotes]) => {
                const collapsed = collapsedStacks.has(stackName);
                return (
                  <li
                    key={stackName}
                    className={`file-tree-group${dragOverStack === stackName ? " drag-over" : ""}`}
                    onDragOver={(e) => {
                      if (!acceptsNoteDrag(e)) return;
                      e.preventDefault();
                      e.dataTransfer.dropEffect = "move";
                    }}
                    onDragEnter={(e) => {
                      if (!acceptsNoteDrag(e)) return;
                      e.preventDefault();
                      setDragOverStack(stackName);
                    }}
                    onDragLeave={(e) => {
                      if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
                      setDragOverStack((cur) => (cur === stackName ? null : cur));
                    }}
                    onDrop={(e) => handleDropOnStack(e, stackName)}
                  >
                    <div
                      className="file-tree-group-header"
                      tabIndex={0}
                      onClick={() => toggleStack(stackName)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          toggleStack(stackName);
                        }
                      }}
                    >
                      <span className="file-tree-group-icon" aria-hidden="true">
                        {collapsed ? "📁" : "📂"}
                      </span>
                      <span className="file-tree-group-name">{stackName}</span>
                    </div>
                    {!collapsed && (
                      <ul className="file-tree-group-children">
                        {stackNotes.map((note) => renderNoteRow(note, true))}
                      </ul>
                    )}
                  </li>
                );
              })
          : sorted.map((note) => renderNoteRow(note, false))}
        {sorted.length === 0 && <li className="file-tree-empty">No notes yet</li>}
      </ul>
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={[
            { label: "Rename", shortcut: "F2", icon: <RenameIcon />, onClick: () => onRename(contextMenu.note) },
            { label: "Delete", shortcut: "Del", icon: <DeleteIcon />, onClick: () => onDelete(contextMenu.note) },
            ...moveToMenuEntries(contextMenu.note),
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
