import { useState } from "react";
import { ContextMenu, type ContextMenuEntry } from "./ContextMenu";
import { pluginRegistry } from "../plugins/registry";

interface Props {
  regionId?: string;
  activeName?: string | null;
  root?: string | null;
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
      { label: "Settings", onClick: () => pluginRegistry.runCommand("view.openSettings") },
    ],
  },
];

export function TitleBarChrome({ regionId, activeName, root }: Props) {
  const notesFolderLabel = activeName ?? root?.split(/[\\/]/).pop();
  const [openMenu, setOpenMenu] = useState<{ id: string; x: number; y: number } | null>(null);

  return (
    <div className="titlebar-drag" data-region-id={regionId}>
      <div className="titlebar-left">
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
      </div>
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
