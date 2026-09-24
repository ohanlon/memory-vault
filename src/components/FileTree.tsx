import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, KeyboardEvent, ReactNode } from "react";
import type { FileTemplate, Note } from "@shared/types";
import { findDuplicateTitles } from "@shared/duplicateTitles";
import { pluginRegistry } from "../plugins/registry";
import { pushToPlugin } from "../plugins/pluginFrameRegistry";
import { buildFileTree, type FileTreeNode } from "../notesFolder/fileTree";
import { ContextMenu, type ContextMenuEntry } from "./ContextMenu";
import { DeleteIcon, InsertIcon, NoteIcon, OpenInExplorerIcon, RenameIcon } from "./icons";

// Base left padding for a top-level row, plus how much further each nested
// folder level indents - mirrors the fixed 26px .file-tree-item-indented
// already used for template rows one level deep, but generalized to
// whatever depth a note's subfolder (created via the CLI's --subfolder,
// or by hand) actually nests to.
const FILE_TREE_BASE_PADDING = 10;
const FILE_TREE_INDENT_STEP = 16;

interface Props {
  notes: Note[];
  /** Relative paths ("/"-separated) of folders with no notes in them yet — see fileTree.ts's buildFileTree. */
  emptyFolderPaths?: string[];
  activePath: string | null;
  renamingPath: string | null;
  /** The folder path ("/"-separated, relative) currently selected as the target for "New Note" — see App.tsx. */
  selectedFolderPath: string | null;
  onSelectFolder: (path: string) => void;
  onSelect: (note: Note) => void;
  onDelete: (note: Note) => void;
  onRename: (note: Note) => void;
  onConvertToTemplate: (note: Note) => void;
  onCommitNoteRename: (note: Note, newTitle: string) => void;
  onCancelRename: () => void;
  /** Create a new folder nested at the same depth as `note`. */
  onNewFolder: (note: Note) => void;
  onShowInExplorer: (absPath: string) => void;
  /** Every template file available in the current notes folder — shown in
   *  their own "Templates" group, separate from the regular note list
   *  they're deliberately excluded from. */
  templates: FileTemplate[];
  onSelectTemplate: (template: FileTemplate) => void;
  onDeleteTemplate: (template: FileTemplate) => void;
}

type ContextMenuState = { note: Note; x: number; y: number };
type TemplateContextMenuState = { template: FileTemplate; x: number; y: number };

const TEMPLATES_GROUP_KEY = "__templates__";

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
  style?: CSSProperties;
}

function EditableLabel({ initialValue, className, onCommit, onCancel, style }: EditableLabelProps) {
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
  notes,
  emptyFolderPaths,
  activePath,
  renamingPath,
  selectedFolderPath,
  onSelectFolder,
  onSelect,
  onDelete,
  onRename,
  onConvertToTemplate,
  onCommitNoteRename,
  onCancelRename,
  onNewFolder,
  onShowInExplorer,
  templates,
  onSelectTemplate,
  onDeleteTemplate,
}: Props) {
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [templateContextMenu, setTemplateContextMenu] = useState<TemplateContextMenuState | null>(null);
  const [templatesCollapsed, setTemplatesCollapsed] = useState(false);
  const [collapsedFolders, setCollapsedFolders] = useState<Set<string>>(new Set());

  const tree = useMemo(() => buildFileTree(notes, emptyFolderPaths), [notes, emptyFolderPaths]);

  // Titles that appear on more than one note — shown with their relative
  // path as a disambiguating hint, since two notes in different folders can
  // still share a title.
  const duplicateTitles = useMemo(() => findDuplicateTitles(notes), [notes]);

  function toggleFolder(path: string) {
    setCollapsedFolders((current) => {
      const next = new Set(current);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }

  function renderNoteRow(note: Note, depth: number): ReactNode {
    const paddingLeft = FILE_TREE_BASE_PADDING + depth * FILE_TREE_INDENT_STEP;
    if (note.path === renamingPath) {
      return (
        <li key={note.path} className={note.path === activePath ? "active" : ""}>
          <EditableLabel
            className="file-tree-item file-tree-item-edit"
            initialValue={note.title}
            onCommit={(value) => onCommitNoteRename(note, value)}
            onCancel={onCancelRename}
            style={{ paddingLeft }}
          />
        </li>
      );
    }
    return (
      <li key={note.path} className={note.path === activePath ? "active" : ""}>
        <button
          className="file-tree-item"
          style={{ paddingLeft }}
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
  }

  function renderFolderRow(folder: Extract<FileTreeNode, { kind: "folder" }>, depth: number): ReactNode {
    const collapsed = collapsedFolders.has(folder.path);
    const paddingLeft = FILE_TREE_BASE_PADDING + depth * FILE_TREE_INDENT_STEP;
    return (
      <li key={folder.path} className="file-tree-group">
        <div
          className={`file-tree-group-header${folder.path === selectedFolderPath ? " active" : ""}`}
          style={{ paddingLeft }}
          tabIndex={0}
          onClick={() => {
            onSelectFolder(folder.path);
            toggleFolder(folder.path);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              onSelectFolder(folder.path);
              toggleFolder(folder.path);
            }
          }}
        >
          <span className="file-tree-group-icon" aria-hidden="true">
            {collapsed ? "📁" : "📂"}
          </span>
          <span className="file-tree-group-name">{folder.name}</span>
        </div>
        {!collapsed && <ul className="file-tree-group-children">{renderNodes(folder.children, depth + 1)}</ul>}
      </li>
    );
  }

  function renderNodes(nodes: FileTreeNode[], depth: number): ReactNode[] {
    return nodes.map((node) => (node.kind === "folder" ? renderFolderRow(node, depth) : renderNoteRow(node.note, depth)));
  }

  function renderTemplateRow(template: FileTemplate): ReactNode {
    return (
      <li key={template.path} className={template.path === activePath ? "active" : ""}>
        <button
          className="file-tree-item file-tree-item-indented"
          onClick={() => onSelectTemplate(template)}
          onContextMenu={(e) => {
            e.preventDefault();
            setTemplateContextMenu({ template, x: e.clientX, y: e.clientY });
          }}
        >
          <span className="file-tree-item-title">{template.name}</span>
        </button>
      </li>
    );
  }

  // Templates never enter the regular notes array (they're deliberately
  // excluded from the graph/search/watcher — see electron/templates.ts), so
  // they get their own special group instead of mixing into the flat list.
  function renderTemplateGroup(): ReactNode {
    return (
      <li key={TEMPLATES_GROUP_KEY} className="file-tree-group file-tree-group-templates">
        <div
          className="file-tree-group-header"
          tabIndex={0}
          onClick={() => setTemplatesCollapsed((v) => !v)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              setTemplatesCollapsed((v) => !v);
            }
          }}
        >
          <span className="file-tree-group-icon" aria-hidden="true">
            {templatesCollapsed ? "📁" : "📑"}
          </span>
          <span className="file-tree-group-name">Templates</span>
        </div>
        {!templatesCollapsed && (
          <ul className="file-tree-group-children">{templates.map((template) => renderTemplateRow(template))}</ul>
        )}
      </li>
    );
  }

  return (
    <>
      <ul className="file-tree" tabIndex={0}>
        {templates.length > 0 && renderTemplateGroup()}
        {renderNodes(tree, 0)}
        {notes.length === 0 && <li className="file-tree-empty">No notes yet</li>}
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
              label: "New Folder",
              icon: <InsertIcon />,
              onClick: () => onNewFolder(contextMenu.note),
            },
            {
              label: "Convert to template",
              icon: <NoteIcon />,
              onClick: () => onConvertToTemplate(contextMenu.note),
            },
            {
              label: "Open in explorer",
              icon: <OpenInExplorerIcon />,
              onClick: () => onShowInExplorer(contextMenu.note.path),
            },
          ]}
          onClose={() => setContextMenu(null)}
        />
      )}
      {templateContextMenu && (
        <ContextMenu
          x={templateContextMenu.x}
          y={templateContextMenu.y}
          items={[
            {
              label: "Delete",
              icon: <DeleteIcon />,
              onClick: () => onDeleteTemplate(templateContextMenu.template),
            },
          ]}
          onClose={() => setTemplateContextMenu(null)}
        />
      )}
    </>
  );
}
