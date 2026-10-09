import { useState } from "react";
import { ContextMenu, type ContextMenuEntry } from "./ContextMenu";
import { pluginRegistry } from "../plugins/registry";
import { useCompactViewport } from "../useCompactViewport";
import { canPickFolder } from "../hostCapabilities";

interface Props {
  regionId?: string;
  activeName?: string | null;
  root?: string | null;
  /** Whether a file is currently selected — gates "New Folder", which needs one to know where to nest. */
  hasActiveNote?: boolean;
  /** Not-done task count across the notes folder, for the title bar's task callout. */
  outstandingTaskCount?: number;
  /** How many of those outstanding tasks are past their deadline — shown as a stronger callout. */
  overdueTaskCount?: number;
  onOpenTasks?: () => void;
}

// Linking an existing folder needs a directory picker, which some hosts (mobile) don't have.
function linkFolderItems(): ContextMenuEntry[] {
  return canPickFolder()
    ? [{ label: "Link Existing Folder…", onClick: () => pluginRegistry.runCommand("notesFolder.add") }]
    : [];
}

// No notes folder is open yet (the home/picker screen) - there's no
// sidebar, editor, or graph to act on, so the only thing that makes sense
// is opening one, matching the screen's own "+ Add notes folder" button.
function homeMenus(): { id: string; label: string; items: ContextMenuEntry[] }[] {
  return [
    {
      id: "file",
      label: "File",
      items: [
        { label: "New Notes Folder…", onClick: () => pluginRegistry.runCommand("notesFolder.create") },
        ...linkFolderItems(),
      ],
    },
  ];
}

function notesFolderMenus(hasActiveNote: boolean): { id: string; label: string; items: ContextMenuEntry[] }[] {
  return [
    {
      id: "file",
      label: "File",
      items: [
        { label: "New Notes Folder…", onClick: () => pluginRegistry.runCommand("notesFolder.create") },
        ...linkFolderItems(),
        { label: "Switch Notes Folder…", onClick: () => pluginRegistry.runCommand("stack.switchStack") },
        { separator: true },
        { label: "New Note", onClick: () => pluginRegistry.runCommand("stack.newNote") },
        { label: "New Daily Note", onClick: () => pluginRegistry.runCommand("stack.openDailyNote") },
        { label: "New Task", onClick: () => pluginRegistry.runCommand("stack.newTask") },
        {
          label: "New Folder",
          disabled: !hasActiveNote,
          onClick: () => pluginRegistry.runCommand("stack.newFolder"),
        },
        { separator: true },
        { label: "Export…", onClick: () => pluginRegistry.runCommand("stack.exportNotesFolder") },
      ],
    },
    {
      id: "view",
      label: "View",
      items: [
        { label: "Toggle Sidebar", onClick: () => pluginRegistry.runCommand("view.toggleSidebar") },
        { label: "Toggle Right Panel", onClick: () => pluginRegistry.runCommand("view.toggleRightPanel") },
        { separator: true },
        { label: "Graph", onClick: () => pluginRegistry.runCommand("view.openGraph") },
        { label: "Tasks", onClick: () => pluginRegistry.runCommand("view.openTasks") },
        { label: "Settings", onClick: () => pluginRegistry.runCommand("view.openSettings") },
      ],
    },
  ];
}

export function TitleBarChrome({
  regionId,
  activeName,
  root,
  hasActiveNote,
  outstandingTaskCount = 0,
  overdueTaskCount = 0,
  onOpenTasks,
}: Props) {
  const notesFolderLabel = activeName ?? root?.split(/[\\/]/).pop();
  const [openMenu, setOpenMenu] = useState<{ id: string; x: number; y: number } | null>(null);
  const menus = root == null ? homeMenus() : notesFolderMenus(!!hasActiveNote);
  const compact = useCompactViewport();

  return (
    <div className="titlebar-drag" data-region-id={regionId}>
      <div className="titlebar-left">
        {compact && root != null && (
          // The sidebar is an overlay drawer at phone width, so it needs an always-visible way to open it.
          <button
            className="titlebar-sidebar-btn"
            aria-label="Toggle sidebar"
            onClick={() => pluginRegistry.runCommand("view.toggleSidebar")}
          >
            ☰
          </button>
        )}
        <button
          className="titlebar-app-icon-btn"
          aria-label="System menu"
          onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            window.memoryStack.showSystemMenu(rect.left, rect.bottom);
          }}
        >
          <img src="/icon.png" alt="" className="titlebar-app-icon" />
        </button>
        {root != null && (
          <div className="titlebar-notes-folder">
            <span className="titlebar-notes-folder-name" title={root}>
              {notesFolderLabel}
            </span>
          </div>
        )}
        <div className="titlebar-app-menu">
          {menus.map((menu) => (
            <button
              key={menu.id}
              className="titlebar-app-menu-btn"
              onClick={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                setOpenMenu((cur) =>
                  cur?.id === menu.id ? null : { id: menu.id, x: rect.left, y: rect.bottom }
                );
              }}
            >
              {menu.label}
            </button>
          ))}
        </div>
      </div>
      {root != null && outstandingTaskCount > 0 && (
        <div className="titlebar-right">
          <button
            className={`titlebar-tasks-badge${overdueTaskCount > 0 ? " titlebar-tasks-badge-overdue" : ""}`}
            onClick={onOpenTasks}
            title={
              overdueTaskCount > 0
                ? `${overdueTaskCount} task${overdueTaskCount === 1 ? "" : "s"} overdue`
                : `${outstandingTaskCount} outstanding task${outstandingTaskCount === 1 ? "" : "s"}`
            }
          >
            ☑ {outstandingTaskCount}
          </button>
        </div>
      )}
      {openMenu && (
        <ContextMenu
          x={openMenu.x}
          y={openMenu.y}
          items={menus.find((m) => m.id === openMenu.id)!.items}
          onClose={() => setOpenMenu(null)}
        />
      )}
    </div>
  );
}
