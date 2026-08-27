import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useVault } from "./vault/useVault";
import { StatusBar } from "./components/StatusBar";
import { ResizeHandle } from "./components/ResizeHandle";
import { PropertySchemaModal } from "./components/PropertySchemaModal";
import { PromptModal } from "./components/PromptModal";
import { ConfirmModal } from "./components/ConfirmModal";
import { TabBar, type TabItem } from "./components/TabBar";
import { pluginRegistry } from "./plugins/registry";
import { TabbedRegion } from "./plugins/TabbedRegion";
import { TabKindSlot } from "./plugins/TabKindSlot";
import {
  addTab as addTabPath,
  GRAPH_TAB_ID,
  SETTINGS_TAB_ID,
  reconcileTabs,
  removeTab,
  renameTab,
} from "./vault/tabs";
import { stripMdExtension } from "@shared/displayName";
import { isSameOrDescendant } from "@shared/fileTree";
import { defaultLayouts, findLayout, getRegion, hasRegion } from "@shared/layouts";
import { DEFAULT_LAYOUT_PREFS, MAX_SIDEBAR_WIDTH, MIN_SIDEBAR_WIDTH } from "@shared/layoutPrefs";
import { DEFAULT_APP_SETTINGS } from "@shared/appSettings";
import type { AppSettings, FolderEntry, LayoutRegionName, Note } from "@shared/types";

// Which named layout drives the screen. No UI to switch layouts yet — the
// data model (shared/layouts.json) already supports more than one.
const ACTIVE_LAYOUT_NAME = "default";

// Width of the left-ribbon column — the one grid track that isn't resizable.
const ACTIVITY_BAR_WIDTH = 48;

function clampWidth(width: number): number {
  return Math.min(MAX_SIDEBAR_WIDTH, Math.max(MIN_SIDEBAR_WIDTH, width));
}

type DeleteTarget = { type: "note"; note: Note } | { type: "folder"; folder: FolderEntry };

function deleteConfirmMessage(target: DeleteTarget, notes: Note[], folders: FolderEntry[]): string {
  if (target.type === "note") {
    return `Delete "${stripMdExtension(target.note.relativePath)}"? This can't be undone.`;
  }
  const folder = target.folder;
  const noteCount = notes.filter((n) => isSameOrDescendant(folder.path, n.path)).length;
  const subfolderCount = folders.filter(
    (f) => f.path !== folder.path && isSameOrDescendant(folder.path, f.path)
  ).length;
  const parts: string[] = [];
  if (noteCount > 0) parts.push(`${noteCount} note${noteCount === 1 ? "" : "s"}`);
  if (subfolderCount > 0) parts.push(`${subfolderCount} subfolder${subfolderCount === 1 ? "" : "s"}`);
  const warning = parts.length > 0 ? ` It contains ${parts.join(" and ")} that will also be deleted.` : "";
  return `Delete folder "${folder.relativePath}"?${warning} This can't be undone.`;
}

type DialogState =
  | { kind: "name-vault"; root: string }
  | { kind: "manage-properties" }
  | { kind: "confirm-delete"; target: DeleteTarget }
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
  const [renamingPath, setRenamingPath] = useState<string | null>(null);
  const [dialog, setDialog] = useState<DialogState>(null);
  const [skipDeleteConfirm, setSkipDeleteConfirm] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [rightPanelCollapsed, setRightPanelCollapsed] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(DEFAULT_LAYOUT_PREFS.sidebarWidth);
  const [rightPanelWidth, setRightPanelWidth] = useState(DEFAULT_LAYOUT_PREFS.rightPanelWidth);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_APP_SETTINGS);
  // Mirrors the two widths above so the drag-end handler can save the exact
  // latest value without waiting for a re-render to read fresh state.
  const widthsRef = useRef(DEFAULT_LAYOUT_PREFS);

  useEffect(() => {
    window.memoryVault.readLayoutPrefs().then((prefs) => {
      setSidebarWidth(prefs.sidebarWidth);
      setRightPanelWidth(prefs.rightPanelWidth);
      widthsRef.current = prefs;
    });
    window.memoryVault.readAppSettings().then(setSettings);
  }, []);

  function updateSettings(next: AppSettings) {
    setSettings(next);
    window.memoryVault.saveAppSettings(next);
  }

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
          if (p === SETTINGS_TAB_ID) return { id: p, label: "Settings" };
          const note = notes.find((n) => n.path === p);
          if (!note) return null;
          const inSubfolder = /[\\/]/.test(note.relativePath);
          if (!inSubfolder || settings.tabFolderDisplay === "never") {
            return { id: p, label: note.title };
          }
          const fullPath = stripMdExtension(note.relativePath);
          if (settings.tabFolderDisplay === "always") {
            return { id: p, label: fullPath };
          }
          return { id: p, label: note.title, fullLabel: fullPath };
        })
        .filter((t): t is TabItem => t !== null),
    [openPaths, notes, settings.tabFolderDisplay]
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

  async function handleCreateNote(dir: string) {
    setSidebarCollapsed(false);
    const newPath = await window.memoryVault.createNote(dir, "");
    await refresh();
    openTab(newPath);
    setRenamingPath(newPath);
  }

  async function handleCreateFolder(dir: string) {
    setSidebarCollapsed(false);
    const newPath = await window.memoryVault.createFolder(dir, "");
    await refresh();
    setRenamingPath(newPath);
  }

  async function handleOpenDailyNote() {
    if (!root) return;
    const result = await window.memoryVault.openOrCreateDailyNote(settings.dailyNotesFolder);
    if (result.created) await refresh();
    openTab(result.path);
  }

  async function performDeleteNote(note: Note) {
    await window.memoryVault.deleteNote(note.path);
    closeTab(note.path);
    await refresh();
  }

  async function performDeleteFolder(folder: FolderEntry) {
    await window.memoryVault.deleteFolder(folder.path);
    await refresh();
  }

  function requestDelete(target: DeleteTarget) {
    if (skipDeleteConfirm) {
      if (target.type === "note") performDeleteNote(target.note);
      else performDeleteFolder(target.folder);
      return;
    }
    setDialog({ kind: "confirm-delete", target });
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

  async function handleCommitNoteRename(note: Note, newTitle: string) {
    setRenamingPath(null);
    if (!newTitle || newTitle === note.title) return;
    const newPath = await window.memoryVault.renameNote(note.path, newTitle);
    setOpenPaths((paths) => renameTab(paths, note.path, newPath));
    await refresh();
    if (activePath === note.path) setActivePath(newPath);
  }

  async function handleCommitFolderRename(folder: FolderEntry, newName: string) {
    setRenamingPath(null);
    const currentName = folder.relativePath.split(/[\\/]/).pop() ?? "";
    if (!newName || newName === currentName) return;
    await window.memoryVault.renameFolder(folder.path, newName);
    await refresh();
  }

  // Bind the commands core regions/views invoke by id. Re-registered every
  // render (cheap — a few Map.set calls) so handlers always close over
  // current state instead of going stale.
  useEffect(() => {
    pluginRegistry.registerCommand("vault.newNote", () => {
      if (root) handleCreateNote(root);
    });
    pluginRegistry.registerCommand("vault.newFolder", () => {
      if (root) handleCreateFolder(root);
    });
    pluginRegistry.registerCommand("vault.openDailyNote", () => handleOpenDailyNote());
    pluginRegistry.registerCommand("vault.switchVault", () => handleSwitchVault());
    pluginRegistry.registerCommand("vault.deleteNote", (note: Note) => requestDelete({ type: "note", note }));
    pluginRegistry.registerCommand("vault.rename", (note: Note) => {
      setSidebarCollapsed(false);
      setRenamingPath(note.path);
    });
    pluginRegistry.registerCommand("vault.renameFolder", (folder: FolderEntry) => {
      setSidebarCollapsed(false);
      setRenamingPath(folder.path);
    });
    pluginRegistry.registerCommand("vault.newNoteInFolder", (dir: string) => handleCreateNote(dir));
    pluginRegistry.registerCommand("vault.newFolderInFolder", (dir: string) => handleCreateFolder(dir));
    pluginRegistry.registerCommand("vault.deleteFolder", (folder: FolderEntry) =>
      requestDelete({ type: "folder", folder })
    );
    pluginRegistry.registerCommand("vault.moveNote", (notePath: string, destDir: string) =>
      handleMoveNote(notePath, destDir)
    );
    pluginRegistry.registerCommand("vault.moveFolder", (folderPath: string, destDir: string) =>
      handleMoveFolder(folderPath, destDir)
    );
    pluginRegistry.registerCommand("view.toggleSidebar", () => setSidebarCollapsed((v) => !v));
    pluginRegistry.registerCommand("view.toggleRightPanel", () => setRightPanelCollapsed((v) => !v));
    pluginRegistry.registerCommand("view.openGraph", () => openTab(GRAPH_TAB_ID));
    pluginRegistry.registerCommand("view.openSettings", () => openTab(SETTINGS_TAB_ID));
    pluginRegistry.registerCommand("properties.manageSchema", () => setDialog({ kind: "manage-properties" }));
  });

  // F2 renames the active note, regardless of whether focus is on its tab,
  // its sidebar row, or the editor itself.
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key !== "F2" || !activeNote) return;
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA")) return;
      e.preventDefault();
      setRenamingPath(activeNote.path);
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeNote]);

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
            onOpenDailyNote={() => pluginRegistry.runCommand("vault.openDailyNote")}
            onGraphView={() => pluginRegistry.runCommand("view.openGraph")}
            onOpenSettings={() => pluginRegistry.runCommand("view.openSettings")}
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
              renamingPath,
              onSelect: (n: Note) => openTab(n.path),
              onDelete: (n: Note) => pluginRegistry.runCommand("vault.deleteNote", n),
              onRename: (n: Note) => pluginRegistry.runCommand("vault.rename", n),
              onRenameFolder: (f: FolderEntry) => pluginRegistry.runCommand("vault.renameFolder", f),
              onCommitNoteRename: (n: Note, newTitle: string) => handleCommitNoteRename(n, newTitle),
              onCommitFolderRename: (f: FolderEntry, newName: string) => handleCommitFolderRename(f, newName),
              onCancelRename: () => setRenamingPath(null),
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
            <TabBar
              tabs={openTabItems}
              activeId={activePath}
              onSelect={openTab}
              onClose={closeTab}
              isFileTab={(id) => id !== GRAPH_TAB_ID && id !== SETTINGS_TAB_ID}
              onRename={(id) => {
                const note = notes.find((n) => n.path === id);
                if (note) pluginRegistry.runCommand("vault.rename", note);
              }}
              onDelete={(id) => {
                const note = notes.find((n) => n.path === id);
                if (note) pluginRegistry.runCommand("vault.deleteNote", note);
              }}
            />
            <TabKindSlot
              tabId={activePath}
              slotProps={{
                note: activeNote,
                graph,
                activeTitle: activeNote?.title ?? null,
                onSaved: refresh,
                onSelectTitle: selectByTitle,
                onOpenExternal: openExternal,
                settings,
                onChange: updateSettings,
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

        {dialog?.kind === "confirm-delete" && (
          <ConfirmModal
            title={dialog.target.type === "note" ? "Delete note" : "Delete folder"}
            message={deleteConfirmMessage(dialog.target, notes, folders)}
            confirmLabel="Delete"
            onConfirm={(dontAskAgain) => {
              if (dontAskAgain) setSkipDeleteConfirm(true);
              if (dialog.target.type === "note") performDeleteNote(dialog.target.note);
              else performDeleteFolder(dialog.target.folder);
              setDialog(null);
            }}
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
