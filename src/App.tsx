import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useStack } from "./stack/useStack";
import { StatusBar } from "./components/StatusBar";
import { ResizeHandle } from "./components/ResizeHandle";
import { PropertySchemaModal } from "./components/PropertySchemaModal";
import { PromptModal } from "./components/PromptModal";
import { ConfirmModal } from "./components/ConfirmModal";
import { ContextMenu } from "./components/ContextMenu";
import { TabBar, type TabItem } from "./components/TabBar";
import { pluginRegistry } from "./plugins/registry";
import { TabbedRegion } from "./plugins/TabbedRegion";
import { TabKindSlot } from "./plugins/TabKindSlot";
import {
  addTab as addTabPath,
  GRAPH_TAB_ID,
  SETTINGS_TAB_ID,
  reconcileTabs,
  relativePathToTabId,
  removeTab,
  renameTab,
  tabIdToRelativePath,
} from "./stack/tabs";
import { stripMdExtension } from "@shared/displayName";
import { isSameOrDescendant } from "@shared/fileTree";
import { defaultLayouts, findLayout, getRegion, hasRegion } from "@shared/layouts";
import { DEFAULT_LAYOUT_PREFS, MAX_SIDEBAR_WIDTH, MIN_SIDEBAR_WIDTH } from "@shared/layoutPrefs";
import { DEFAULT_APP_SETTINGS } from "@shared/appSettings";
import type { AppSettings, FolderEntry, LayoutRegionName, Note, StackEntry } from "@shared/types";

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
  | { kind: "name-stack"; root: string }
  | { kind: "rename-stack"; stack: StackEntry }
  | { kind: "manage-properties" }
  | { kind: "confirm-delete"; target: DeleteTarget }
  | null;

type StackContextMenuState = { stack: StackEntry; x: number; y: number };

export default function App() {
  const {
    stacks,
    activeName,
    root,
    notes,
    folders,
    graph,
    propertySchema,
    loading,
    error,
    fullyLoaded,
    openStackByEntry,
    addStack,
    removeStack,
    renameStack,
    closeStack,
    refresh,
    saveSchema,
    saveNoteProperties,
    loadFolderChildren,
  } = useStack();
  const [openPaths, setOpenPaths] = useState<string[]>([]);
  const [activePath, setActivePath] = useState<string | null>(null);
  const [renamingPath, setRenamingPath] = useState<string | null>(null);
  const [collapsedFolders, setCollapsedFolders] = useState<string[]>([]);
  // Which stack root a workspace-state restore has been kicked off for, so a
  // refresh() of the same stack doesn't retrigger it — reset to null when the
  // stack closes so reopening it (or a different one) restores again.
  const restoreStartedRootRef = useRef<string | null>(null);
  // Which stack root restored data has actually landed for — gates saving so
  // the debounced save effect can't write back stale pre-restore state.
  const restoredReadyRootRef = useRef<string | null>(null);
  const workspaceSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [dialog, setDialog] = useState<DialogState>(null);
  const [stackContextMenu, setStackContextMenu] = useState<StackContextMenuState | null>(null);
  const [skipDeleteConfirm, setSkipDeleteConfirm] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [rightPanelCollapsed, setRightPanelCollapsed] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(DEFAULT_LAYOUT_PREFS.sidebarWidth);
  const [rightPanelWidth, setRightPanelWidth] = useState(DEFAULT_LAYOUT_PREFS.rightPanelWidth);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_APP_SETTINGS);
  const [resolvedTheme, setResolvedTheme] = useState<"dark" | "light">("dark");
  // Mirrors the two widths above so the drag-end handler can save the exact
  // latest value without waiting for a re-render to read fresh state.
  const widthsRef = useRef(DEFAULT_LAYOUT_PREFS);

  // Resolves the "system" theme setting against the OS preference and
  // reflects the result on <html> so index.css's [data-theme] rules apply.
  // Also stays in sync if the OS preference changes while "system" is active.
  useEffect(() => {
    const theme = settings.theme;
    const media = window.matchMedia("(prefers-color-scheme: light)");
    function apply() {
      const resolved = theme === "system" ? (media.matches ? "light" : "dark") : theme;
      setResolvedTheme(resolved);
      document.documentElement.dataset.theme = resolved;
      window.memoryStack.setTitleBarOverlay(resolved);
    }
    apply();
    if (theme !== "system") return;
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [settings.theme]);

  useEffect(() => {
    window.memoryStack.readLayoutPrefs().then((prefs) => {
      setSidebarWidth(prefs.sidebarWidth);
      setRightPanelWidth(prefs.rightPanelWidth);
      widthsRef.current = prefs;
    });
    window.memoryStack.readAppSettings().then(setSettings);
  }, []);

  function updateSettings(next: AppSettings) {
    setSettings(next);
    window.memoryStack.saveAppSettings(next);
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
    window.memoryStack.saveLayoutPrefs(widthsRef.current);
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

  // Drop collapsed-folder entries for folders that no longer exist. Gated on
  // fullyLoaded so this doesn't run against the still-partial folder list
  // lazy loading produces right after opening a stack — pruning against an
  // incomplete list would permanently forget the collapsed state of any
  // folder that hasn't been discovered yet. Returns the same array reference
  // when nothing changed so this doesn't retrigger the debounced save effect.
  useEffect(() => {
    if (!fullyLoaded) return;
    const existing = new Set(folders.map((f) => f.relativePath));
    setCollapsedFolders((paths) => {
      const filtered = paths.filter((p) => existing.has(p));
      return filtered.length === paths.length ? paths : filtered;
    });
  }, [folders, fullyLoaded]);

  // Restores open tabs/collapsed folders from <stack>/.cairn/workspace.json
  // whenever a (newly opened or reopened) stack finishes loading. Guarded by
  // restoreStartedRootRef so a refresh() of the same stack — triggered on
  // every note create/save/delete — doesn't stomp on the current session's tabs.
  useEffect(() => {
    if (!root || restoreStartedRootRef.current === root) return;
    restoreStartedRootRef.current = root;
    window.memoryStack.readWorkspaceState().then((state) => {
      const restoredTabs = state.openTabs
        .map((rel) => relativePathToTabId(rel, notes))
        .filter((id): id is string => id !== null);
      setOpenPaths(restoredTabs);
      const restoredActive = state.activeTab ? relativePathToTabId(state.activeTab, notes) : null;
      setActivePath(restoredActive && restoredTabs.includes(restoredActive) ? restoredActive : restoredTabs[0] ?? null);
      // Trust the persisted list as-is rather than filtering against `folders`
      // here — at this point only the root level has loaded, so anything
      // nested would look nonexistent and be dropped before it ever gets a
      // chance to load; the fullyLoaded-gated reconcile effect prunes
      // genuinely-stale entries once the whole vault is known.
      setCollapsedFolders(state.collapsedFolders);
      // Proactively load children for folders restored as expanded, so far as
      // is known this early (root level) — deeper ones catch up once the
      // background full scan lands.
      const restoredCollapsed = new Set(state.collapsedFolders);
      for (const folder of folders) {
        if (!restoredCollapsed.has(folder.relativePath)) loadFolderChildren(folder);
      }
      restoredReadyRootRef.current = root;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [root]);

  // A stack was closed — clear both guards so reopening it (or a different
  // stack) triggers a fresh restore instead of being skipped as a no-op.
  useEffect(() => {
    if (root === null) {
      restoreStartedRootRef.current = null;
      restoredReadyRootRef.current = null;
    }
  }, [root]);

  // Persists open tabs/active tab/collapsed folders back to workspace.json,
  // debounced so rapid tab switching doesn't spam disk writes. Gated on
  // restoredReadyRootRef so this can't fire with stale state before the
  // restore above has actually landed.
  useEffect(() => {
    if (!root || restoredReadyRootRef.current !== root) return;
    if (workspaceSaveTimer.current) clearTimeout(workspaceSaveTimer.current);
    workspaceSaveTimer.current = setTimeout(() => {
      const openTabs = openPaths
        .map((id) => tabIdToRelativePath(id, notes))
        .filter((p): p is string => p !== null);
      const activeTab = activePath ? tabIdToRelativePath(activePath, notes) : null;
      window.memoryStack.saveWorkspaceState({ collapsedFolders, openTabs, activeTab });
    }, 300);
    return () => {
      if (workspaceSaveTimer.current) clearTimeout(workspaceSaveTimer.current);
    };
  }, [root, openPaths, activePath, collapsedFolders, notes]);

  const toggleFolder = useCallback(
    (relativePath: string) => {
      const isExpanding = collapsedFolders.includes(relativePath);
      if (isExpanding) {
        const folder = folders.find((f) => f.relativePath === relativePath);
        if (folder) loadFolderChildren(folder);
      }
      setCollapsedFolders((prev) =>
        prev.includes(relativePath) ? prev.filter((p) => p !== relativePath) : [...prev, relativePath]
      );
    },
    [collapsedFolders, folders, loadFolderChildren]
  );

  const expandFolders = useCallback(
    (relativePaths: string[]) => {
      for (const relativePath of relativePaths) {
        const folder = folders.find((f) => f.relativePath === relativePath);
        if (folder) loadFolderChildren(folder);
      }
      setCollapsedFolders((prev) => prev.filter((p) => !relativePaths.includes(p)));
    },
    [folders, loadFolderChildren]
  );

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
      const found = notes.find((n) => n.title.toLowerCase() === title.toLowerCase());
      if (found) {
        openTab(found.path);
        return;
      }
      if (!root) return;
      window.memoryStack.createNote(root, title).then(async (newPath) => {
        await refresh();
        openTab(newPath);
      });
    },
    [notes, openTab, root, refresh]
  );

  const openExternal = useCallback((url: string) => {
    window.memoryStack.openExternal(url);
  }, []);

  async function handlePickFolder() {
    const root = await window.memoryStack.pickStack();
    if (root) setDialog({ kind: "name-stack", root });
  }

  async function handleNameStackSubmit(name: string) {
    if (dialog?.kind !== "name-stack") return;
    try {
      await addStack(name, dialog.root);
      setDialog(null);
      setOpenPaths([]);
      setActivePath(null);
    } catch (err) {
      window.alert(err instanceof Error ? err.message : String(err));
      // keep the dialog open so the user can retry with a different name
    }
  }

  function handleSwitchStack() {
    setOpenPaths([]);
    setActivePath(null);
    closeStack();
  }

  async function handleRemoveStack(name: string) {
    if (!window.confirm(`Remove stack "${name}" from the list? The folder itself is untouched.`)) return;
    await removeStack(name);
  }

  async function handleRenameStackSubmit(newName: string) {
    if (dialog?.kind !== "rename-stack") return;
    const oldName = dialog.stack.name;
    try {
      await renameStack(oldName, newName);
      setDialog(null);
    } catch (err) {
      window.alert(err instanceof Error ? err.message : String(err));
      // keep the dialog open so the user can retry with a different name
    }
  }

  async function handleCreateNote(dir: string) {
    setSidebarCollapsed(false);
    const newPath = await window.memoryStack.createNote(dir, "");
    await refresh();
    openTab(newPath);
    setRenamingPath(newPath);
  }

  async function handleCreateFolder(dir: string) {
    setSidebarCollapsed(false);
    const newPath = await window.memoryStack.createFolder(dir, "");
    await refresh();
    setRenamingPath(newPath);
  }

  async function handleOpenDailyNote() {
    if (!root) return;
    const result = await window.memoryStack.openOrCreateDailyNote(settings.dailyNotesFolder);
    if (result.created) await refresh();
    openTab(result.path);
  }

  async function performDeleteNote(note: Note) {
    await window.memoryStack.deleteNote(note.path);
    closeTab(note.path);
    await refresh();
  }

  async function performDeleteFolder(folder: FolderEntry) {
    await window.memoryStack.deleteFolder(folder.path);
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
      const newPath = await window.memoryStack.moveNote(notePath, destDir);
      setOpenPaths((paths) => renameTab(paths, notePath, newPath));
      if (activePath === notePath) setActivePath(newPath);
      await refresh();
    } catch (err) {
      window.alert(err instanceof Error ? err.message : String(err));
    }
  }

  async function handleMoveFolder(folderPath: string, destDir: string) {
    try {
      await window.memoryStack.moveFolder(folderPath, destDir);
      await refresh();
    } catch (err) {
      window.alert(err instanceof Error ? err.message : String(err));
    }
  }

  async function handleCommitNoteRename(note: Note, newTitle: string) {
    setRenamingPath(null);
    if (!newTitle || newTitle === note.title) return;
    const newPath = await window.memoryStack.renameNote(note.path, newTitle);
    setOpenPaths((paths) => renameTab(paths, note.path, newPath));
    await refresh();
    if (activePath === note.path) setActivePath(newPath);
  }

  async function handleCommitFolderRename(folder: FolderEntry, newName: string) {
    setRenamingPath(null);
    const currentName = folder.relativePath.split(/[\\/]/).pop() ?? "";
    if (!newName || newName === currentName) return;
    await window.memoryStack.renameFolder(folder.path, newName);
    await refresh();
  }

  // Bind the commands core regions/views invoke by id. Re-registered every
  // render (cheap — a few Map.set calls) so handlers always close over
  // current state instead of going stale.
  useEffect(() => {
    pluginRegistry.registerCommand("stack.newNote", () => {
      if (root) handleCreateNote(root);
    });
    pluginRegistry.registerCommand("stack.newFolder", () => {
      if (root) handleCreateFolder(root);
    });
    pluginRegistry.registerCommand("stack.openDailyNote", () => handleOpenDailyNote());
    pluginRegistry.registerCommand("stack.switchStack", () => handleSwitchStack());
    pluginRegistry.registerCommand("stack.deleteNote", (note: Note) => requestDelete({ type: "note", note }));
    pluginRegistry.registerCommand("stack.rename", (note: Note) => {
      setSidebarCollapsed(false);
      setRenamingPath(note.path);
    });
    pluginRegistry.registerCommand("stack.renameFolder", (folder: FolderEntry) => {
      setSidebarCollapsed(false);
      setRenamingPath(folder.path);
    });
    pluginRegistry.registerCommand("stack.newNoteInFolder", (dir: string) => handleCreateNote(dir));
    pluginRegistry.registerCommand("stack.newFolderInFolder", (dir: string) => handleCreateFolder(dir));
    pluginRegistry.registerCommand("stack.deleteFolder", (folder: FolderEntry) =>
      requestDelete({ type: "folder", folder })
    );
    pluginRegistry.registerCommand("stack.moveNote", (notePath: string, destDir: string) =>
      handleMoveNote(notePath, destDir)
    );
    pluginRegistry.registerCommand("stack.moveFolder", (folderPath: string, destDir: string) =>
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
          <h1>Cairn</h1>
          {stacks.length === 0 ? (
            <p>Add a folder of markdown notes to get started.</p>
          ) : (
            <ul className="stack-list">
              {stacks.map((v) => (
                <li key={v.name.toLowerCase()}>
                  <button
                    className="stack-list-item"
                    onClick={() => openStackByEntry(v)}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      setStackContextMenu({ stack: v, x: e.clientX, y: e.clientY });
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "F2") {
                        e.preventDefault();
                        setDialog({ kind: "rename-stack", stack: v });
                        return;
                      }
                      if (e.key !== "Delete") return;
                      e.preventDefault();
                      handleRemoveStack(v.name);
                    }}
                  >
                    <span className="stack-list-name">{v.name}</span>
                    <span className="stack-list-path">{v.root}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <button onClick={handlePickFolder}>+ Add Stack</button>
          {error && <p className="error">{error}</p>}

          {dialog?.kind === "name-stack" && (
            <PromptModal
              title="Name this stack"
              confirmLabel="Add"
              onSubmit={handleNameStackSubmit}
              onCancel={() => setDialog(null)}
            />
          )}
          {dialog?.kind === "rename-stack" && (
            <PromptModal
              title="Rename stack to"
              initialValue={dialog.stack.name}
              confirmLabel="Rename"
              onSubmit={handleRenameStackSubmit}
              onCancel={() => setDialog(null)}
            />
          )}
          {stackContextMenu && (
            <ContextMenu
              x={stackContextMenu.x}
              y={stackContextMenu.y}
              items={[
                {
                  label: "Rename",
                  shortcut: "F2",
                  onClick: () => setDialog({ kind: "rename-stack", stack: stackContextMenu.stack }),
                },
                {
                  label: "Delete",
                  shortcut: "Del",
                  onClick: () => handleRemoveStack(stackContextMenu.stack.name),
                },
              ]}
              onClose={() => setStackContextMenu(null)}
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
          activeName={activeName}
          root={root}
          onSwitchStack={() => pluginRegistry.runCommand("stack.switchStack")}
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
            onNewNote={() => pluginRegistry.runCommand("stack.newNote")}
            onNewFolder={() => pluginRegistry.runCommand("stack.newFolder")}
            onOpenDailyNote={() => pluginRegistry.runCommand("stack.openDailyNote")}
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
              loading,
              notes,
              folders,
              activePath,
              renamingPath,
              collapsedFolders,
              onToggleFolder: toggleFolder,
              onExpandFolders: expandFolders,
              onSelect: (n: Note) => openTab(n.path),
              onDelete: (n: Note) => pluginRegistry.runCommand("stack.deleteNote", n),
              onRename: (n: Note) => pluginRegistry.runCommand("stack.rename", n),
              onRenameFolder: (f: FolderEntry) => pluginRegistry.runCommand("stack.renameFolder", f),
              onCommitNoteRename: (n: Note, newTitle: string) => handleCommitNoteRename(n, newTitle),
              onCommitFolderRename: (f: FolderEntry, newName: string) => handleCommitFolderRename(f, newName),
              onCancelRename: () => setRenamingPath(null),
              onNewNoteInFolder: (dir: string) => pluginRegistry.runCommand("stack.newNoteInFolder", dir),
              onNewFolderInFolder: (dir: string) => pluginRegistry.runCommand("stack.newFolderInFolder", dir),
              onDeleteFolder: (f: FolderEntry) => pluginRegistry.runCommand("stack.deleteFolder", f),
              onMoveNote: (notePath: string, destDir: string) =>
                pluginRegistry.runCommand("stack.moveNote", notePath, destDir),
              onMoveFolder: (folderPath: string, destDir: string) =>
                pluginRegistry.runCommand("stack.moveFolder", folderPath, destDir),
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
                if (note) pluginRegistry.runCommand("stack.rename", note);
              }}
              onDelete={(id) => {
                const note = notes.find((n) => n.path === id);
                if (note) pluginRegistry.runCommand("stack.deleteNote", note);
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
                theme: resolvedTheme,
                schema: propertySchema,
                onSaveProperties: saveNoteProperties,
                onOpenSchemaManager: () => pluginRegistry.runCommand("properties.manageSchema"),
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
