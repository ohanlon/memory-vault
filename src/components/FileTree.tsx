import { useEffect, useMemo, useRef, useState } from "react";
import type { DragEvent, KeyboardEvent, ReactNode } from "react";
import { buildFileTree, isSameOrDescendant } from "@shared/fileTree";
import type { TreeNode } from "@shared/fileTree";
import type { FolderEntry, Note } from "@shared/types";
import { matchesShortcut, shortcutLabel } from "../platform";
import { ContextMenu, type ContextMenuEntry } from "./ContextMenu";

export interface NavClipboard {
  type: "note" | "folder";
  mode: "cut" | "copy";
  path: string;
}

interface Props {
  root: string;
  notes: Note[];
  folders: FolderEntry[];
  activePath: string | null;
  renamingPath: string | null;
  /** Relative paths of folders currently collapsed — persisted per stack by the caller. */
  collapsedFolders: string[];
  /** Relative paths of folders excluded from the graph — persisted per stack by the caller. */
  excludedFolders: string[];
  onToggleFolder: (relativePath: string) => void;
  onToggleExcludeFolder: (folder: FolderEntry) => void;
  onExpandFolders: (relativePaths: string[]) => void;
  onSelect: (note: Note) => void;
  onDelete: (note: Note) => void;
  onRename: (note: Note) => void;
  onRenameFolder: (folder: FolderEntry) => void;
  onCommitNoteRename: (note: Note, newTitle: string) => void;
  onCommitFolderRename: (folder: FolderEntry, newName: string) => void;
  onCancelRename: () => void;
  onNewNoteInFolder: (dir: string) => void;
  onNewFolderInFolder: (dir: string) => void;
  onDeleteFolder: (folder: FolderEntry) => void;
  onMoveNote: (notePath: string, destDir: string) => void;
  onMoveFolder: (folderPath: string, destDir: string) => void;
  onShowInExplorer: (absPath: string) => void;
  clipboard: NavClipboard | null;
  onCutNote: (note: Note) => void;
  onCopyNote: (note: Note) => void;
  onCutFolder: (folder: FolderEntry) => void;
  onCopyFolder: (folder: FolderEntry) => void;
  onPasteInto: (destDir: string) => void;
}

const NOTE_DRAG_TYPE = "application/x-cairn-note";
const FOLDER_DRAG_TYPE = "application/x-cairn-folder";

type ContextMenuState = {
  target:
    | { type: "note"; note: Note; parentDir: string }
    | { type: "folder"; folder: FolderEntry }
    | { type: "root" };
  x: number;
  y: number;
};

function acceptsDrag(e: DragEvent) {
  return e.dataTransfer.types.includes(NOTE_DRAG_TYPE) || e.dataTransfer.types.includes(FOLDER_DRAG_TYPE);
}

/** Every proper prefix of `segs`, e.g. ["a","b","c"] -> ["a", "a/b"] — the ancestor folders of the path, excluding the path itself. */
function ancestorRelativePaths(segs: string[]): string[] {
  const result: string[] = [];
  for (let i = 1; i < segs.length; i++) result.push(segs.slice(0, i).join("/"));
  return result;
}

interface EditableLabelProps {
  initialValue: string;
  className: string;
  style?: React.CSSProperties;
  onCommit: (value: string) => void;
  onCancel: () => void;
}

function EditableLabel({ initialValue, className, style, onCommit, onCancel }: EditableLabelProps) {
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
      style={style}
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
  root,
  notes,
  folders,
  activePath,
  renamingPath,
  collapsedFolders,
  excludedFolders,
  onToggleFolder,
  onToggleExcludeFolder,
  onExpandFolders,
  onSelect,
  onDelete,
  onRename,
  onRenameFolder,
  onCommitNoteRename,
  onCommitFolderRename,
  onCancelRename,
  onNewNoteInFolder,
  onNewFolderInFolder,
  onDeleteFolder,
  onMoveNote,
  onMoveFolder,
  onShowInExplorer,
  clipboard,
  onCutNote,
  onCopyNote,
  onCutFolder,
  onCopyFolder,
  onPasteInto,
}: Props) {
  const collapsed = useMemo(() => new Set(collapsedFolders), [collapsedFolders]);
  const excluded = useMemo(() => new Set(excludedFolders), [excludedFolders]);
  const [dragOver, setDragOver] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const tree = buildFileTree(notes, folders, root);

  // Make sure the row being created/renamed is actually visible, even if it
  // sits inside a folder the user had collapsed.
  useEffect(() => {
    if (!renamingPath) return;
    const note = notes.find((n) => n.path === renamingPath);
    const folder = note ? null : folders.find((f) => f.path === renamingPath);
    const relativePath = note?.relativePath ?? folder?.relativePath;
    if (!relativePath) return;
    const ancestors = ancestorRelativePaths(relativePath.split(/[\\/]/).filter(Boolean));
    if (ancestors.length === 0) return;
    onExpandFolders(ancestors);
  }, [renamingPath, notes, folders, onExpandFolders]);

  function toggle(relativePath: string) {
    onToggleFolder(relativePath);
  }

  function handleDrop(e: DragEvent, destDir: string) {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(null);
    const notePath = e.dataTransfer.getData(NOTE_DRAG_TYPE);
    if (notePath) {
      onMoveNote(notePath, destDir);
      return;
    }
    const folderPath = e.dataTransfer.getData(FOLDER_DRAG_TYPE);
    if (folderPath && !isSameOrDescendant(folderPath, destDir)) {
      onMoveFolder(folderPath, destDir);
    }
  }

  function renderNode(node: TreeNode, depth: number, parentDir: string): ReactNode {
    if (node.type === "note") {
      const note = node.note;
      if (note.path === renamingPath) {
        return (
          <li key={note.path} className={note.path === activePath ? "active" : ""}>
            <EditableLabel
              className="file-tree-item file-tree-item-edit"
              style={{ paddingLeft: 10 + depth * 16 }}
              initialValue={note.title}
              onCommit={(value) => onCommitNoteRename(note, value)}
              onCancel={onCancelRename}
            />
          </li>
        );
      }
      const isCut = clipboard?.mode === "cut" && clipboard.type === "note" && clipboard.path === note.path;
      return (
        <li key={note.path} className={note.path === activePath ? "active" : ""}>
          <button
            className={`file-tree-item${isCut ? " file-tree-item-cut" : ""}`}
            style={{ paddingLeft: 10 + depth * 16 }}
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData(NOTE_DRAG_TYPE, note.path);
              e.dataTransfer.effectAllowed = "move";
            }}
            onClick={() => onSelect(note)}
            onContextMenu={(e) => {
              e.preventDefault();
              setContextMenu({ target: { type: "note", note, parentDir }, x: e.clientX, y: e.clientY });
            }}
            onKeyDown={(e: KeyboardEvent) => {
              if (e.key === "F2") {
                e.preventDefault();
                onRename(note);
                return;
              }
              if (matchesShortcut(e, "x")) {
                e.preventDefault();
                onCutNote(note);
                return;
              }
              if (matchesShortcut(e, "c")) {
                e.preventDefault();
                onCopyNote(note);
                return;
              }
              if (matchesShortcut(e, "v")) {
                if (!clipboard) return;
                e.preventDefault();
                onPasteInto(parentDir);
                return;
              }
              if (e.key !== "Delete") return;
              e.preventDefault();
              onDelete(note);
            }}
          >
            {note.title}
          </button>
        </li>
      );
    }

    const isCollapsed = collapsed.has(node.relativePath);
    const isDragOver = dragOver === node.relativePath;
    const isExcluded = excluded.has(node.relativePath);
    const isCut = clipboard?.mode === "cut" && clipboard.type === "folder" && clipboard.path === node.path;
    const folderEntry: FolderEntry = { path: node.path, relativePath: node.relativePath };
    const isRenamingFolder = node.path === renamingPath;
    return (
      <li key={node.relativePath} className="file-tree-folder">
        <div
          className={`file-tree-folder-row${isDragOver ? " drag-over" : ""}${isExcluded ? " file-tree-folder-row-excluded" : ""}${isCut ? " file-tree-folder-row-cut" : ""}`}
          style={{ paddingLeft: 4 + depth * 16 }}
          tabIndex={0}
          draggable={!isRenamingFolder}
          onDragStart={(e) => {
            e.dataTransfer.setData(FOLDER_DRAG_TYPE, node.path);
            e.dataTransfer.effectAllowed = "move";
          }}
          onDragOver={(e) => {
            if (!acceptsDrag(e)) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = "move";
          }}
          onDragEnter={(e) => {
            if (!acceptsDrag(e)) return;
            e.preventDefault();
            setDragOver(node.relativePath);
          }}
          onDragLeave={() => setDragOver((cur) => (cur === node.relativePath ? null : cur))}
          onDrop={(e) => handleDrop(e, node.path)}
          onClick={() => toggle(node.relativePath)}
          onContextMenu={(e) => {
            e.preventDefault();
            setContextMenu({ target: { type: "folder", folder: folderEntry }, x: e.clientX, y: e.clientY });
          }}
          onKeyDown={(e: KeyboardEvent) => {
            if (e.key === "F2") {
              e.preventDefault();
              onRenameFolder(folderEntry);
              return;
            }
            if (matchesShortcut(e, "x")) {
              e.preventDefault();
              onCutFolder(folderEntry);
              return;
            }
            if (matchesShortcut(e, "c")) {
              e.preventDefault();
              onCopyFolder(folderEntry);
              return;
            }
            if (matchesShortcut(e, "v")) {
              if (!clipboard) return;
              e.preventDefault();
              onPasteInto(node.path);
              return;
            }
            if (e.key !== "Delete") return;
            e.preventDefault();
            onDeleteFolder(folderEntry);
          }}
        >
          <span className="file-tree-folder-icon" aria-hidden="true">
            {isCollapsed ? "📁" : "📂"}
          </span>
          {isRenamingFolder ? (
            <EditableLabel
              className="file-tree-folder-name file-tree-folder-name-edit"
              initialValue={node.name}
              onCommit={(value) => onCommitFolderRename(folderEntry, value)}
              onCancel={onCancelRename}
            />
          ) : (
            <span className="file-tree-folder-name">{node.name}</span>
          )}
          <span className="file-tree-folder-actions">
            <button
              title="New note in this folder"
              onClick={(e) => {
                e.stopPropagation();
                onNewNoteInFolder(node.path);
              }}
            >
              +
            </button>
            <button
              title="New subfolder"
              onClick={(e) => {
                e.stopPropagation();
                onNewFolderInFolder(node.path);
              }}
            >
              ⊞
            </button>
          </span>
        </div>
        {!isCollapsed && node.children.length > 0 && (
          <ul className="file-tree-children">
            {node.children.map((c) => renderNode(c, depth + 1, node.path))}
          </ul>
        )}
      </li>
    );
  }

  return (
    <>
      <ul
        className={`file-tree${dragOver === "" ? " drag-over-root" : ""}`}
        tabIndex={0}
        onDragOver={(e) => {
          if (!acceptsDrag(e)) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = "move";
        }}
        onDragEnter={(e) => {
          if (!acceptsDrag(e)) return;
          e.preventDefault();
          setDragOver("");
        }}
        onDragLeave={(e) => {
          if (e.currentTarget === e.target) setDragOver((cur) => (cur === "" ? null : cur));
        }}
        onDrop={(e) => handleDrop(e, root)}
        onContextMenu={(e) => {
          if (e.target !== e.currentTarget || !clipboard) return;
          e.preventDefault();
          setContextMenu({ target: { type: "root" }, x: e.clientX, y: e.clientY });
        }}
        onKeyDown={(e: KeyboardEvent) => {
          if (e.target !== e.currentTarget || !clipboard) return;
          if (!matchesShortcut(e, "v")) return;
          e.preventDefault();
          onPasteInto(root);
        }}
      >
        {tree.children.map((c) => renderNode(c, 0, root))}
        {tree.children.length === 0 && <li className="file-tree-empty">No notes yet</li>}
      </ul>
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={
            contextMenu.target.type === "note"
              ? (() => {
                  const { note, parentDir } = contextMenu.target;
                  const items: ContextMenuEntry[] = [
                    { label: "Rename", shortcut: "F2", onClick: () => onRename(note) },
                    { label: "Delete", shortcut: "Del", onClick: () => onDelete(note) },
                    { separator: true as const },
                    { label: "Cut", shortcut: shortcutLabel("X"), onClick: () => onCutNote(note) },
                    { label: "Copy", shortcut: shortcutLabel("C"), onClick: () => onCopyNote(note) },
                  ];
                  if (clipboard) {
                    items.push({
                      label: "Paste",
                      shortcut: shortcutLabel("V"),
                      onClick: () => onPasteInto(parentDir),
                    });
                  }
                  items.push(
                    { separator: true as const },
                    { label: "Open in explorer", onClick: () => onShowInExplorer(note.path) }
                  );
                  return items;
                })()
              : contextMenu.target.type === "folder"
              ? (() => {
                  const folder = contextMenu.target.folder;
                  const isExcluded = excluded.has(folder.relativePath);
                  const items: ContextMenuEntry[] = [
                    { label: "Rename", shortcut: "F2", onClick: () => onRenameFolder(folder) },
                    { label: "Delete", shortcut: "Del", onClick: () => onDeleteFolder(folder) },
                    { separator: true as const },
                    { label: "Cut", shortcut: shortcutLabel("X"), onClick: () => onCutFolder(folder) },
                    { label: "Copy", shortcut: shortcutLabel("C"), onClick: () => onCopyFolder(folder) },
                  ];
                  if (clipboard) {
                    items.push({
                      label: "Paste",
                      shortcut: shortcutLabel("V"),
                      onClick: () => onPasteInto(folder.path),
                    });
                  }
                  items.push(
                    { separator: true as const },
                    {
                      label: isExcluded ? "Include in Graph" : "Exclude from Graph",
                      onClick: () => onToggleExcludeFolder(folder),
                    },
                    { separator: true as const },
                    { label: "Open in explorer", onClick: () => onShowInExplorer(folder.path) }
                  );
                  return items;
                })()
              : [{ label: "Paste", shortcut: shortcutLabel("V"), onClick: () => onPasteInto(root) }]
          }
          onClose={() => setContextMenu(null)}
        />
      )}
    </>
  );
}
