import { useState } from "react";
import type { DragEvent, ReactNode } from "react";
import { buildFileTree, isSameOrDescendant } from "@shared/fileTree";
import type { TreeNode } from "@shared/fileTree";
import type { FolderEntry, Note } from "@shared/types";
import { ContextMenu } from "./ContextMenu";

interface Props {
  root: string;
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
}

const NOTE_DRAG_TYPE = "application/x-memory-vault-note";
const FOLDER_DRAG_TYPE = "application/x-memory-vault-folder";

function acceptsDrag(e: DragEvent) {
  return e.dataTransfer.types.includes(NOTE_DRAG_TYPE) || e.dataTransfer.types.includes(FOLDER_DRAG_TYPE);
}

export function FileTree({
  root,
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
}: Props) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [dragOver, setDragOver] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<{ note: Note; x: number; y: number } | null>(null);
  const tree = buildFileTree(notes, folders, root);

  function toggle(relativePath: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(relativePath)) next.delete(relativePath);
      else next.add(relativePath);
      return next;
    });
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

  function renderNode(node: TreeNode, depth: number): ReactNode {
    if (node.type === "note") {
      const note = node.note;
      return (
        <li key={note.path} className={note.path === activePath ? "active" : ""}>
          <button
            className="file-tree-item"
            style={{ paddingLeft: 10 + depth * 16 }}
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData(NOTE_DRAG_TYPE, note.path);
              e.dataTransfer.effectAllowed = "move";
            }}
            onClick={() => onSelect(note)}
            onContextMenu={(e) => {
              e.preventDefault();
              setContextMenu({ note, x: e.clientX, y: e.clientY });
            }}
          >
            {note.title}
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
      );
    }

    const isCollapsed = collapsed.has(node.relativePath);
    const isDragOver = dragOver === node.relativePath;
    return (
      <li key={node.relativePath} className="file-tree-folder">
        <div
          className={`file-tree-folder-row${isDragOver ? " drag-over" : ""}`}
          style={{ paddingLeft: 4 + depth * 16 }}
          draggable
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
        >
          <span className="file-tree-disclosure">{isCollapsed ? "▸" : "▾"}</span>
          <span className="file-tree-folder-name">{node.name}</span>
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
            <button
              title="Delete folder"
              onClick={(e) => {
                e.stopPropagation();
                onDeleteFolder({ path: node.path, relativePath: node.relativePath });
              }}
            >
              ×
            </button>
          </span>
        </div>
        {!isCollapsed && node.children.length > 0 && (
          <ul className="file-tree-children">{node.children.map((c) => renderNode(c, depth + 1))}</ul>
        )}
      </li>
    );
  }

  return (
    <>
      <ul
        className={`file-tree${dragOver === "" ? " drag-over-root" : ""}`}
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
      >
        {tree.children.map((c) => renderNode(c, 0))}
        {tree.children.length === 0 && <li className="file-tree-empty">No notes yet</li>}
      </ul>
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={[{ label: "Rename", shortcut: "F2", onClick: () => onRename(contextMenu.note) }]}
          onClose={() => setContextMenu(null)}
        />
      )}
    </>
  );
}
