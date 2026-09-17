import { useState } from "react";
import { ContextMenu, type ContextMenuEntry } from "./ContextMenu";
import { pluginRegistry } from "../plugins/registry";

interface Props {
  rightPanelCollapsed: boolean;
  onToggleRightPanel: () => void;
  showRightPanelToggle: boolean;
  regionId?: string;
  activeName?: string | null;
  root?: string | null;
  onSwitchNotesFolder?: () => void;
}

const APP_MENUS: { id: string; label: string; items: ContextMenuEntry[] }[] = [
  {
    id: "file",
    label: "File",
    items: [
      { label: "Add Notes Folder…", onClick: () => pluginRegistry.runCommand("notesFolder.add") },
      { label: "Switch Notes Folder…", onClick: () => pluginRegistry.runCommand("stack.switchStack") },
      { separator: true },
      { label: "New Note", onClick: () => pluginRegistry.runCommand("stack.newNote") },
      { label: "New Daily Note", onClick: () => pluginRegistry.runCommand("stack.openDailyNote") },
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
      { label: "Settings", onClick: () => pluginRegistry.runCommand("view.openSettings") },
    ],
  },
];

export function TitleBarChrome({
  rightPanelCollapsed,
  onToggleRightPanel,
  showRightPanelToggle,
  regionId,
  activeName,
  root,
  onSwitchNotesFolder,
}: Props) {
  const notesFolderLabel = activeName ?? root?.split(/[\\/]/).pop();
  const [openMenu, setOpenMenu] = useState<{ id: string; x: number; y: number } | null>(null);

  return (
    <div className="titlebar-drag" data-region-id={regionId}>
      <div className="titlebar-left">
        <div className="titlebar-app-menu">
          {APP_MENUS.map((menu) => (
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
        {onSwitchNotesFolder && (
          <div className="titlebar-notes-folder">
            <span className="titlebar-notes-folder-name" title={root ?? undefined}>
              {notesFolderLabel}
            </span>
            <button className="titlebar-switch-btn" onClick={onSwitchNotesFolder} title="Switch notes folder">
              Switch
            </button>
          </div>
        )}
      </div>
      {showRightPanelToggle && (
        <button
          className="titlebar-collapse-btn"
          onClick={onToggleRightPanel}
          title={rightPanelCollapsed ? "Show right panel" : "Hide right panel"}
        >
          {rightPanelCollapsed ? "»" : "«"}
        </button>
      )}
      {openMenu && (
        <ContextMenu
          x={openMenu.x}
          y={openMenu.y}
          items={APP_MENUS.find((m) => m.id === openMenu.id)!.items}
          onClose={() => setOpenMenu(null)}
        />
      )}
    </div>
  );
}
