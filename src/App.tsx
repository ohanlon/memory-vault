import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useVault } from "./vault/useVault";
import { StatusBar } from "./components/StatusBar";
import { ResizeHandle } from "./components/ResizeHandle";
import { PropertySchemaModal } from "./components/PropertySchemaModal";
import { PromptModal } from "./components/PromptModal";
import { TabBar, type TabItem } from "./components/TabBar";
import { pluginRegistry } from "./plugins/registry";
import { TabbedRegion } from "./plugins/TabbedRegion";
import { TabKindSlot } from "./plugins/TabKindSlot";
import { addTab as addTabPath, GRAPH_TAB_ID, reconcileTabs, removeTab, renameTab } from "./vault/tabs";
import { stripMdExtension } from "@shared/displayName";
import { defaultLayouts, findLayout, getRegion, hasRegion } from "@shared/layouts";
import { DEFAULT_LAYOUT_PREFS, MAX_SIDEBAR_WIDTH, MIN_SIDEBAR_WIDTH } from "@shared/layoutPrefs";
import type { FolderEntry, LayoutRegionName, Note } from "@shared/types";

// Which named layout drives the screen. No UI to switch layouts yet — the
// data model (shared/layouts.json) already supports more than one.
const ACTIVE_LAYOUT_NAME = "default";

// Width of the left-ribbon column — the one grid track that isn't resizable.
const ACTIVITY_BAR_WIDTH = 48;

function clampWidth(width: number): number {
  return Math.min(MAX_SIDEBAR_WIDTH, Math.max(MIN_SIDEBAR_WIDTH, width));
}

type DialogState =
  | { kind: "new-note"; dir: string }
  | { kind: "new-folder"; dir: string }
  | { kind: "rename"; note: Note }
  | { kind: "name-vault"; root: string }
  | { kind: "manage-properties" }
  | null;

export default function App() {
  const {
    vaults,
    activeName,
    root,
    notes,
    folders,
    graph,
    propertySchema,
    loading,
    error,
    openVaultByEntry,
    addVault,
    removeVault,
    closeVault,
    refresh,
    saveSchema,
    saveNoteProperties,
  } = useVault();
  const [openPaths, setOpenPaths] = useState<string[]>([]);
  const [activePath, setActivePath] = useState<string | null>(null);
  const [dialog, setDialog] = useState<DialogState>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [rightPanelCollapsed, setRightPanelCollapsed] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(DEFAULT_LAYOUT_PREFS.sidebarWidth);
  const [rightPanelWidth, setRightPanelWidth] = useState(DEFAULT_LAYOUT_PREFS.rightPanelWidth);
  // Mirrors the two widths above so the drag-end handler can save the exact
  // latest value without waiting for a re-render to read fresh state.
  const widthsRef = useRef(DEFAULT_LAYOUT_PREFS);

  useEffect(() => {
    window.memoryVault.readLayoutPrefs().then((prefs) => {
      setSidebarWidth(prefs.sidebarWidth);
      setRightPanelWidth(prefs.rightPanelWidth);
      widthsRef.current = prefs;
    });
  }, []);

  function resizeSidebar(deltaX: number) {
    setSidebarWidth((w) => {
      const next = clampWidth(w + deltaX);
      widthsRef.current = { ...widthsRef.current, sidebarWidth: next };
      return next;
    });
  }

  function resizeRightPanel(deltaX: number) {
    setRightPanelWidth((w) => {
      const next = clampWidth(w - deltaX);
      widthsRef.current = { ...widthsRef.current, rightPanelWidth: next };
      return next;
    });
  }

  function saveWidths() {
    window.memoryVault.saveLayoutPrefs(widthsRef.current);
  }

  const layout = findLayout(defaultLayouts, ACTIVE_LAYOUT_NAME);
  if (!layout) throw new Error(`Unknown layout: "${ACTIVE_LAYOUT_NAME}"`);
  const isRegionPresent = (name: LayoutRegionName) => hasRegion(layout, name);
  const regionId = (name: LayoutRegionName) => getRegion(layout, name)?.id;

  const activeNote = useMemo(
    () => notes.find((n) => n.path === activePath) ?? null,
    [notes, activePath]
  );

  const openTabItems = useMemo<TabItem[]>(
    () =>
      openPaths
        .map((p): TabItem | null => {
          if (p === GRAPH_TAB_ID) return { id: p, label: "Graph" };
          const note = notes.find((n) => n.path === p);
          return note ? { id: p, label: stripMdExtension(note.relativePath) } : null;
        })
        .filter((t): t is TabItem => t !== null),
    [openPaths, notes]
  );

  // Drop tabs (and clear the active tab) for notes that no longer exist —
  // e.g. deleted or renamed externally, outside the app's own delete/rename flows.
  // The graph tab is never dropped this way — it isn't a note.
  useEffect(() => {
    const existing = new Set(notes.map((n) => n.path));
    setOpenPaths((paths) => reconcileTabs(paths, existing));
    setActivePath((path) => (path === null || path === GRAPH_TAB_ID || existing.has(path) ? path : null));
  }, [notes]);

  const openTab = useCallback((path: string) => {
    setOpenPaths((paths) => addTabPath(paths, path));
    setActivePath(path);
  }, []);

  const closeTab = useCallback(
    (path: string) => {
      const { paths: remaining, fallback } = removeTab(openPaths, path);
      setOpenPaths(remaining);
      if (activePath === path) setActivePath(fallback);
    },
    [openPaths, activePath]
  );

  const selectByTitle = useCallback(
    (title: string) => {
      const found = notes.find((n) => n.title === title);
      if (found) openTab(found.path);
    },
    [notes, openTab]
  );

  const openExternal = useCallback((url: string) => {
    window.memoryVault.openExternal(url);
  }, []);

  async function handlePickFolder() {
    const root = await window.memoryVault.pickVault();
    if (root) setDialog({ kind: "name-vault", root });
  }

  async function handleNameVaultSubmit(name: string) {
    if (dialog?.kind !== "name-vault") return;
    try {
      await addVault(name, dialog.root);
      setDialog(null);
      setOpenPaths([]);
      setActivePath(null);
    } catch (err) {
      window.alert(err instanceof Error ? err.message : String(err));
      // keep the dialog open so the user can retry with a different name
    }
  }

  function handleSwitchVault() {
    setOpenPaths([]);
    setActivePath(null);
    closeVault();
  }

  async function handleRemoveVault(name: string) {
    if (!window.confirm(`Remove vault "${name}" from the list? The folder itself is untouched.`)) return;
    await removeVault(name);
  }

  async function handleCreateNote(title: string) {
    if (dialog?.kind !== "new-note") return;
    const newPath = await window.memoryVault.createNote(dialog.dir, title);
    await refresh();
    openTab(newPath);
    setDialog(null);
  }

  async function handleCreateFolder(name: string) {
    if (dialog?.kind !== "new-folder") return;
    await window.memoryVault.createFolder(dialog.dir, name);
    await refresh();
    setDialog(null);
  }

  async function handleDelete(note: Note) {
    if (!window.confirm(`Delete "${stripMdExtension(note.relativePath)}"?`)) return;
    await window.memoryVault.deleteNote(note.path);
    closeTab(note.path);
    await refresh();
  }

  async function handleDeleteFolder(folder: FolderEntry) {
    if (!window.confirm(`Delete folder "${folder.relativePath}" and everything inside it?`)) return;
    await window.memoryVault.deleteFolder(folder.path);
    await refresh();
  }

  async function handleMoveNote(notePath: string, destDir: string) {
    try {
      const newPath = await window.memoryVault.moveNote(notePath, destDir);
      setOpenPaths((paths) => renameTab(paths, notePath, newPath));
      if (activePath === notePath) setActivePath(newPath);
      await refresh();
    } catch (err) {
      window.alert(err instanceof Error ? err.message : String(err));
    }
  }

  async function handleMoveFolder(folderPath: string, destDir: string) {
    try {
      await window.memoryVault.moveFolder(folderPath, destDir);
      await refresh();
    } catch (err) {
      window.alert(err instanceof Error ? err.message : String(err));
    }
  }

  async function handleRenameSubmit(newTitle: string) {
    if (dialog?.kind !== "rename") return;
    const note = dialog.note;
    setDialog(null);
    if (newTitle === note.title) return;
    const newPath = await window.memoryVault.renameNote(note.path, newTitle);
    setOpenPaths((paths) => renameTab(paths, note.path, newPath));
    await refresh();
    setActivePath(newPath);
  }

  // Bind the commands core regions/views invoke by id. Re-registered every
  // render (cheap — a few Map.set calls) so handlers always close over
  // current state instead of going stale.
  useEffect(() => {
    pluginRegistry.registerCommand("vault.newNote", () => {
      if (root) setDialog({ kind: "new-note", dir: root });
    });
    pluginRegistry.registerCommand("vault.newFolder", () => {
      if (root) setDialog({ kind: "new-folder", dir: root });
    });
    pluginRegistry.registerCommand("vault.switchVault", () => handleSwitchVault());
    pluginRegistry.registerCommand("vault.deleteNote", (note: Note) => handleDelete(note));
    pluginRegistry.registerCommand("vault.newNoteInFolder", (dir: string) =>
      setDialog({ kind: "new-note", dir })
    );
    pluginRegistry.registerCommand("vault.newFolderInFolder", (dir: string) =>
      setDialog({ kind: "new-folder", dir })
    );
    pluginRegistry.registerCommand("vault.deleteFolder", (folder: FolderEntry) => handleDeleteFolder(folder));
    pluginRegistry.registerCommand("vault.moveNote", (notePath: string, destDir: string) =>
      handleMoveNote(notePath, destDir)
    );
    pluginRegistry.registerCommand("vault.moveFolder", (folderPath: string, destDir: string) =>
      handleMoveFolder(folderPath, destDir)
    );
    pluginRegistry.registerCommand("view.toggleSidebar", () => setSidebarCollapsed((v) => !v));
    pluginRegistry.registerCommand("view.toggleRightPanel", () => setRightPanelCollapsed((v) => !v));
    pluginRegistry.registerCommand("view.openGraph", () => openTab(GRAPH_TAB_ID));
    pluginRegistry.registerCommand("properties.manageSchema", () => setDialog({ kind: "manage-properties" }));
  });

  const TitleBar = pluginRegistry.getRegion("title-bar");
  const LeftRibbon = pluginRegistry.getRegion("left-ribbon");

  if (!root) {
    return (
      <div className="app-shell">
        {isRegionPresent("title-bar") && TitleBar && (
          <TitleBar
            rightPanelCollapsed={false}
            onToggleRightPanel={() => {}}
            showRightPanelToggle={false}
            regionId={regionId("title-bar")}
          />
        )}
        <div className="empty-state">
          <h1>Memory Vault</h1>
          {vaults.length === 0 ? (
            <p>Add a folder of markdown notes to get started.</p>
          ) : (
            <ul className="vault-list">
              {vaults.map((v) => (
                <li key={v.name.toLowerCase()}>
                  <button className="vault-list-item" onClick={() => openVaultByEntry(v)}>
                    <span className="vault-list-name">{v.name}</span>
                    <span className="vault-list-path">{v.root}</span>
                  </button>
                  <button
                    className="vault-list-remove"
                    title="Remove from list"
                    onClick={() => handleRemoveVault(v.name)}
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          )}
          <button onClick={handlePickFolder}>+ Add Vault</button>
          {error && <p className="error">{error}</p>}

          {dialog?.kind === "name-vault" && (
            <PromptModal
              title="Name this vault"
              confirmLabel="Add"
              onSubmit={handleNameVaultSubmit}
              onCancel={() => setDialog(null)}
            />
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="app-shell">
      {isRegionPresent("title-bar") && TitleBar && (
        <TitleBar
          rightPanelCollapsed={rightPanelCollapsed}
          onToggleRightPanel={() => pluginRegistry.runCommand("view.toggleRightPanel")}
          showRightPanelToggle={isRegionPresent("right-sidebar")}
          regionId={regionId("title-bar")}
        />
      )}
      <div
        className="app-layout"
        style={{
          gridTemplateColumns: [
            `${ACTIVITY_BAR_WIDTH}px`,
            !sidebarCollapsed && isRegionPresent("left-sidebar") ? `${sidebarWidth}px` : null,
            "1fr",
            !rightPanelCollapsed && isRegionPresent("right-sidebar") ? `${rightPanelWidth}px` : null,
          ]
            .filter(Boolean)
            .join(" "),
        }}
      >
        {isRegionPresent("left-ribbon") && LeftRibbon && (
          <LeftRibbon
            sidebarCollapsed={sidebarCollapsed}
            onToggleSidebar={() => pluginRegistry.runCommand("view.toggleSidebar")}
            onNewNote={() => pluginRegistry.runCommand("vault.newNote")}
            onNewFolder={() => pluginRegistry.runCommand("vault.newFolder")}
            onGraphView={() => pluginRegistry.runCommand("view.openGraph")}
            regionId={regionId("left-ribbon")}
          />
        )}

        {isRegionPresent("left-sidebar") && !sidebarCollapsed && (
          <TabbedRegion
            className="sidebar"
            regionId={regionId("left-sidebar")}
            views={pluginRegistry.getViews("left-sidebar")}
            viewProps={{
              root,
              activeName,
              loading,
              notes,
              folders,
              activePath,
              onSelect: (n: Note) => openTab(n.path),
              onDelete: (n: Note) => pluginRegistry.runCommand("vault.deleteNote", n),
              onNewNoteInFolder: (dir: string) => pluginRegistry.runCommand("vault.newNoteInFolder", dir),
              onNewFolderInFolder: (dir: string) => pluginRegistry.runCommand("vault.newFolderInFolder", dir),
              onDeleteFolder: (f: FolderEntry) => pluginRegistry.runCommand("vault.deleteFolder", f),
              onMoveNote: (notePath: string, destDir: string) =>
                pluginRegistry.runCommand("vault.moveNote", notePath, destDir),
              onMoveFolder: (folderPath: string, destDir: string) =>
                pluginRegistry.runCommand("vault.moveFolder", folderPath, destDir),
              onSwitchVault: () => pluginRegistry.runCommand("vault.switchVault"),
            }}
          />
        )}

        {isRegionPresent("left-sidebar") && !sidebarCollapsed && (
          <ResizeHandle
            style={{ left: ACTIVITY_BAR_WIDTH + sidebarWidth }}
            onResize={resizeSidebar}
            onResizeEnd={saveWidths}
          />
        )}

        {isRegionPresent("editor") && (
          <main className="editor-area" data-region-id={regionId("editor")}>
            <TabBar tabs={openTabItems} activeId={activePath} onSelect={openTab} onClose={closeTab} />
            {activeNote && (
              <div className="editor-toolbar">
                <button onClick={() => setDialog({ kind: "rename", note: activeNote })}>
                  Rename
                </button>
              </div>
            )}
            <TabKindSlot
              tabId={activePath}
              slotProps={{
                note: activeNote,
                graph,
                activeTitle: activeNote?.title ?? null,
                onSaved: refresh,
                onSelectTitle: selectByTitle,
                onOpenExternal: openExternal,
              }}
            />
          </main>
        )}

        {isRegionPresent("right-sidebar") && !rightPanelCollapsed && (
          <ResizeHandle
            style={{ right: rightPanelWidth }}
            onResize={resizeRightPanel}
            onResizeEnd={saveWidths}
          />
        )}

        {isRegionPresent("right-sidebar") && !rightPanelCollapsed && (
          <TabbedRegion
            className="right-panel"
            regionId={regionId("right-sidebar")}
            views={pluginRegistry.getViews("right-sidebar")}
            viewProps={{
              note: activeNote,
              graph,
              schema: propertySchema,
              activeTitle: activeNote?.title ?? null,
              onSelectTitle: selectByTitle,
              onOpenExternal: openExternal,
              onSaveProperties: saveNoteProperties,
              onOpenSchemaManager: () => pluginRegistry.runCommand("properties.manageSchema"),
            }}
          />
        )}

        {dialog?.kind === "new-note" && (
          <PromptModal
            title="New note title"
            confirmLabel="Create"
            onSubmit={handleCreateNote}
            onCancel={() => setDialog(null)}
          />
        )}
        {dialog?.kind === "new-folder" && (
          <PromptModal
            title="New folder name"
            confirmLabel="Create"
            onSubmit={handleCreateFolder}
            onCancel={() => setDialog(null)}
          />
        )}
        {dialog?.kind === "rename" && (
          <PromptModal
            title="Rename note to"
            initialValue={dialog.note.title}
            confirmLabel="Rename"
            onSubmit={handleRenameSubmit}
            onCancel={() => setDialog(null)}
          />
        )}
        {dialog?.kind === "manage-properties" && (
          <PropertySchemaModal
            schema={propertySchema}
            onSave={async (updated) => {
              await saveSchema(updated);
              setDialog(null);
            }}
            onClose={() => setDialog(null)}
          />
        )}
      </div>

      {isRegionPresent("status-bar") && (
        <StatusBar note={activeNote} graph={graph} regionId={regionId("status-bar")} />
      )}
    </div>
  );
}
