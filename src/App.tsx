import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useStack, type ActiveSession } from "./stack/useStack";
import { StatusBar } from "./components/StatusBar";
import { ResizeHandle } from "./components/ResizeHandle";
import { PropertySchemaModal } from "./components/PropertySchemaModal";
import { PromptModal } from "./components/PromptModal";
import { ConfirmModal } from "./components/ConfirmModal";
import { ContextMenu } from "./components/ContextMenu";
import { ShortcutsPanel } from "./components/ShortcutsPanel";
import { OnboardingTour } from "./components/OnboardingTour";
import { DeleteIcon, RenameIcon } from "./components/icons";
import { TabBar, type TabItem } from "./components/TabBar";
import { pluginRegistry } from "./plugins/registry";
import { TabbedRegion } from "./plugins/TabbedRegion";
import { TabKindSlot } from "./plugins/TabKindSlot";
import { focusView } from "./plugins/focusedViewStore";
import { flushPendingSave } from "./editor/pendingSave";
import type { RibbonItemContribution } from "./plugins/types";
import {
  addTab as addTabPath,
  GRAPH_TAB_ID,
  SETTINGS_TAB_ID,
  closeOtherTabs,
  closeTabsLeft,
  closeTabsRight,
  isSentinelTabId,
  reconcileTabs,
  removeTab,
  renameTab,
  tabIdToTabRef,
  tabRefToTabId,
} from "./stack/tabs";
import { CombineStacksModal } from "./components/CombineStacksModal";
import { stripMdExtension } from "@shared/displayName";
import { backlinkTitles } from "@shared/buildGraph";
import { defaultLayouts, findLayout, getRegion, hasRegion } from "@shared/layouts";
import { DEFAULT_LAYOUT_PREFS, MAX_SIDEBAR_WIDTH, MIN_SIDEBAR_WIDTH } from "@shared/layoutPrefs";
import { DEFAULT_APP_SETTINGS } from "@shared/appSettings";
import { NOTE_TEMPLATES } from "@shared/noteTemplates";
import type { AppSettings, CairnEntry, LayoutRegionName, Note, StackEntry } from "@shared/types";

// Which named layout drives the screen. No UI to switch layouts yet — the
// data model (shared/layouts.json) already supports more than one.
const ACTIVE_LAYOUT_NAME = "default";

// Width of the left-ribbon column — the one grid track that isn't resizable.
const ACTIVITY_BAR_WIDTH = 48;

function clampWidth(width: number): number {
  return Math.min(MAX_SIDEBAR_WIDTH, Math.max(MIN_SIDEBAR_WIDTH, width));
}

function deleteConfirmMessage(note: Note): string {
  return `Delete "${stripMdExtension(note.relativePath)}"? This can't be undone.`;
}

/** The root a note's own stack lives at — the single open stack's root for
 *  a plain session, or the matching member stack's root (via
 *  Note.sourceStack) when notes are merged from an open Cairn. */
function noteRootFor(note: Note | null, session: ActiveSession | null): string | null {
  if (!note || !session) return null;
  if (session.kind === "stack") return session.entry.root;
  return session.memberStacks.find((s) => s.name === note.sourceStack)?.root ?? null;
}

type DialogState =
  | { kind: "name-stack"; root: string }
  | { kind: "rename-stack"; stack: StackEntry }
  | { kind: "rename-cairn"; cairn: CairnEntry }
  | { kind: "combine-stacks" }
  | { kind: "manage-properties"; root: string }
  | { kind: "confirm-delete"; note: Note }
  | { kind: "rename-links"; note: Note; newTitle: string; backlinks: string[] }
  | { kind: "shortcuts" }
  | null;

type StackContextMenuState = { target: { type: "stack"; stack: StackEntry } | { type: "cairn"; cairn: CairnEntry }; x: number; y: number };

export default function App() {
  const {
    stacks,
    cairns,
    activeSession,
    notes,
    graph,
    propertySchemas,
    loading,
    error,
    reconciling,
    openStackByEntry,
    openCairnByEntry,
    addStack,
    removeStack,
    renameStack,
    addCairn,
    removeCairn,
    renameCairn,
    closeStack,
    refresh,
    saveSchema,
    saveNoteProperties,
  } = useStack();
  const [openPaths, setOpenPaths] = useState<string[]>([]);
  const [activePath, setActivePath] = useState<string | null>(null);
  const [renamingPath, setRenamingPath] = useState<string | null>(null);
  // Which session (a stack's root, or "cairn:<name>") a workspace-state
  // restore has been kicked off for, so a refresh() of the same session
  // doesn't retrigger it — reset to null when the session closes so
  // reopening it (or a different one) restores again.
  const restoreStartedSessionRef = useRef<string | null>(null);
  // Which session restored data has actually landed for — gates saving so
  // the debounced save effect can't write back stale pre-restore state.
  const restoredReadySessionRef = useRef<string | null>(null);
  const workspaceSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [dialog, setDialog] = useState<DialogState>(null);
  const [stackContextMenu, setStackContextMenu] = useState<StackContextMenuState | null>(null);
  const [skipDeleteConfirm, setSkipDeleteConfirm] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [rightPanelCollapsed, setRightPanelCollapsed] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(DEFAULT_LAYOUT_PREFS.sidebarWidth);
  const [rightPanelWidth, setRightPanelWidth] = useState(DEFAULT_LAYOUT_PREFS.rightPanelWidth);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_APP_SETTINGS);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [showTour, setShowTour] = useState(false);
  // Stack-picker/template-picker menu shown for "New Note" — for a plain
  // stack this is only ever opened via right-click (see
  // handleNewNoteContextMenu); for an open Cairn, a left-click opens it too,
  // since there's no single implicit target stack to ask "always ask" about.
  const [templateMenu, setTemplateMenu] = useState<{ x: number; y: number } | null>(null);
  // Stack-picker menu for "New Daily Note" in an open Cairn (same "always
  // ask" reasoning as templateMenu; a plain stack never shows this).
  const [dailyNoteMenu, setDailyNoteMenu] = useState<{ x: number; y: number } | null>(null);
  const [resolvedTheme, setResolvedTheme] = useState<"dark" | "light">("dark");
  const activeName = activeSession?.entry.name ?? null;
  const singleStackRoot = activeSession?.kind === "stack" ? activeSession.entry.root : null;
  // Stable identity for the currently-open session, used to gate the
  // workspace-state restore/save effects below.
  const sessionKey = activeSession
    ? activeSession.kind === "cairn"
      ? `cairn:${activeSession.entry.name}`
      : activeSession.entry.root
    : null;
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
    window.memoryStack.readAppSettings().then((s) => {
      setSettings(s);
      setSettingsLoaded(true);
    });
  }, []);

  function updateSettings(next: AppSettings) {
    setSettings(next);
    window.memoryStack.saveAppSettings(next);
  }

  // Shows the first-run tour once a stack is open, provided settings have
  // loaded (so we know for sure it hasn't already been seen) and it hasn't
  // been dismissed before. Never fires again once hasSeenTour is persisted.
  useEffect(() => {
    if (activeSession && settingsLoaded && !settings.hasSeenTour) setShowTour(true);
  }, [activeSession, settingsLoaded, settings.hasSeenTour]);

  function dismissTour() {
    setShowTour(false);
    updateSettings({ ...settings, hasSeenTour: true });
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

  // Which stack root the active note's properties live under — a single
  // stack's own root in a plain session, or the matching member stack when
  // notes are merged from an open Cairn (see noteRootFor).
  const activeNoteRoot = useMemo(
    () => noteRootFor(activeNote, activeSession),
    [activeNote, activeSession]
  );
  const activeNoteSchema = activeNoteRoot ? propertySchemas[activeNoteRoot] ?? [] : [];

  const openTabItems = useMemo<TabItem[]>(
    () =>
      openPaths
        .map((p): TabItem | null => {
          if (isSentinelTabId(p)) {
            const kind = pluginRegistry.getTabKind(p);
            return kind ? { id: p, label: kind.title } : null;
          }
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

  // Reads workspace.json for the currently open session — a plain stack's
  // own <stack>/.cairn/workspace.json, or an open Cairn's
  // <userData>/cairns/<name>/workspace.json.
  const readActiveWorkspaceState = useCallback(() => {
    if (!activeSession) return Promise.resolve(null);
    return activeSession.kind === "cairn"
      ? window.memoryStack.readCairnWorkspaceState(activeSession.entry.name)
      : window.memoryStack.readWorkspaceState();
  }, [activeSession]);

  // Restores open tabs from workspace state whenever a (newly opened or
  // reopened) session finishes loading. Guarded by restoreStartedSessionRef
  // so a refresh() of the same session — triggered on every note
  // create/save/delete — doesn't stomp on the current session's tabs.
  useEffect(() => {
    if (!sessionKey || restoreStartedSessionRef.current === sessionKey) return;
    restoreStartedSessionRef.current = sessionKey;
    readActiveWorkspaceState().then((state) => {
      if (!state) return;
      const restoredTabs = state.openTabs
        .map((ref) => tabRefToTabId(ref, notes))
        .filter((id): id is string => id !== null);
      setOpenPaths(restoredTabs);
      const restoredActive = state.activeTab ? tabRefToTabId(state.activeTab, notes) : null;
      setActivePath(restoredActive && restoredTabs.includes(restoredActive) ? restoredActive : restoredTabs[0] ?? null);
      restoredReadySessionRef.current = sessionKey;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionKey]);

  // A session was closed — clear both guards so reopening it (or a
  // different one) triggers a fresh restore instead of being skipped as a no-op.
  useEffect(() => {
    if (sessionKey === null) {
      restoreStartedSessionRef.current = null;
      restoredReadySessionRef.current = null;
    }
  }, [sessionKey]);

  // Persists open tabs/active tab back to workspace state, debounced so
  // rapid tab switching doesn't spam disk writes. Gated on
  // restoredReadySessionRef so this can't fire with stale state before the
  // restore above has actually landed.
  useEffect(() => {
    if (!activeSession || !sessionKey || restoredReadySessionRef.current !== sessionKey) return;
    if (workspaceSaveTimer.current) clearTimeout(workspaceSaveTimer.current);
    workspaceSaveTimer.current = setTimeout(() => {
      const openTabs = openPaths
        .map((id) => tabIdToTabRef(id, notes))
        .filter((r): r is NonNullable<typeof r> => r !== null);
      const activeTab = activePath ? tabIdToTabRef(activePath, notes) : null;
      const state = { openTabs, activeTab };
      if (activeSession.kind === "cairn") {
        window.memoryStack.saveCairnWorkspaceState(activeSession.entry.name, state);
      } else {
        window.memoryStack.saveWorkspaceState(state);
      }
    }, 300);
    return () => {
      if (workspaceSaveTimer.current) clearTimeout(workspaceSaveTimer.current);
    };
  }, [activeSession, sessionKey, openPaths, activePath, notes]);

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

  const closeTabsLeftOf = useCallback(
    (path: string) => {
      const remaining = closeTabsLeft(openPaths, path);
      setOpenPaths(remaining);
      if (activePath !== null && !remaining.includes(activePath)) setActivePath(path);
    },
    [openPaths, activePath]
  );

  const closeTabsRightOf = useCallback(
    (path: string) => {
      const remaining = closeTabsRight(openPaths, path);
      setOpenPaths(remaining);
      if (activePath !== null && !remaining.includes(activePath)) setActivePath(path);
    },
    [openPaths, activePath]
  );

  const closeOtherTabsOf = useCallback(
    (path: string) => {
      setOpenPaths((paths) => closeOtherTabs(paths, path));
      setActivePath(path);
    },
    []
  );

  const closeAllTabs = useCallback(() => {
    setOpenPaths([]);
    setActivePath(null);
  }, []);

  const selectByTitle = useCallback(
    (title: string) => {
      const found = notes.find((n) => n.title.toLowerCase() === title.toLowerCase());
      if (found) {
        openTab(found.path);
        return;
      }
      if (!activeSession) return;
      // Clicking an unresolved wikilink to create it: for a Cairn this
      // defaults to the first member stack rather than prompting — this
      // one flow keeps its immediacy instead of interrupting the click
      // with a stack picker (New Note/New Daily Note still always ask).
      const targetRoot =
        activeSession.kind === "cairn" ? activeSession.memberStacks[0]?.root : activeSession.entry.root;
      if (!targetRoot) return;
      window.memoryStack.createNote(targetRoot, title).then(async (newPath) => {
        await refresh();
        openTab(newPath);
      });
    },
    [notes, openTab, activeSession, refresh]
  );

  const openExternal = useCallback((url: string) => {
    window.memoryStack.openExternal(url);
  }, []);

  const showInExplorer = useCallback((absPath: string) => {
    window.memoryStack.showItemInFolder(absPath);
  }, []);

  // A left-ribbon launcher button: either reveals/focuses one of the
  // plugin's sidebar views, or opens one of its main-editor-area tabs.
  const openRibbonItem = useCallback(
    (item: RibbonItemContribution) => {
      if (item.tabId) {
        openTab(item.tabId);
        return;
      }
      const view = [...pluginRegistry.getViews("left-sidebar"), ...pluginRegistry.getViews("right-sidebar")].find(
        (v) => v.id === item.viewId
      );
      if (!view) return;
      if (view.region === "left-sidebar") setSidebarCollapsed(false);
      else setRightPanelCollapsed(false);
      focusView(view.region, view.id);
    },
    [openTab]
  );

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

  async function handleCreateNote(dir: string, templateId?: string) {
    setSidebarCollapsed(false);
    const newPath = await window.memoryStack.createNote(dir, "", templateId);
    await refresh();
    openTab(newPath);
    setRenamingPath(newPath);
  }

  async function handleSeedStarterContent() {
    await window.memoryStack.seedStarterContent();
    await refresh({ showReindexing: true });
  }

  async function handleOpenDailyNote(stackRoot: string) {
    const result = await window.memoryStack.openOrCreateDailyNote(settings.dailyNotesFolder, stackRoot);
    if (result.created) await refresh();
    openTab(result.path);
  }

  // "Always ask" for a Cairn: New Note/New Daily Note have no single
  // implicit target stack once notes are merged, so both open a
  // stack-picker menu instead of acting immediately. A plain single-stack
  // session keeps today's one-click behavior.
  function handleNewNoteClick(x: number, y: number) {
    if (!activeSession) return;
    if (activeSession.kind === "stack") {
      handleCreateNote(activeSession.entry.root);
      return;
    }
    setTemplateMenu({ x, y });
  }

  function handleNewNoteContextMenu(x: number, y: number) {
    if (!activeSession) return;
    setTemplateMenu({ x, y });
  }

  function handleOpenDailyNoteClick(x: number, y: number) {
    if (!activeSession) return;
    if (activeSession.kind === "stack") {
      handleOpenDailyNote(activeSession.entry.root);
      return;
    }
    setDailyNoteMenu({ x, y });
  }

  async function handleCombineStacksSubmit(name: string, memberStackNames: string[]) {
    try {
      await addCairn(name, memberStackNames);
      setDialog(null);
    } catch (err) {
      window.alert(err instanceof Error ? err.message : String(err));
    }
  }

  async function handleRemoveCairn(name: string) {
    if (!window.confirm(`Remove Cairn "${name}"? Its member stacks are untouched.`)) return;
    await removeCairn(name);
  }

  async function handleRenameCairnSubmit(newName: string) {
    if (dialog?.kind !== "rename-cairn") return;
    const oldName = dialog.cairn.name;
    try {
      await renameCairn(oldName, newName);
      setDialog(null);
    } catch (err) {
      window.alert(err instanceof Error ? err.message : String(err));
    }
  }

  async function performDeleteNote(note: Note) {
    await window.memoryStack.deleteNote(note.path);
    closeTab(note.path);
    await refresh();
  }

  function requestDelete(note: Note) {
    if (skipDeleteConfirm) {
      performDeleteNote(note);
      return;
    }
    setDialog({ kind: "confirm-delete", note });
  }

  async function performNoteRename(note: Note, newTitle: string, updateLinks: boolean) {
    // Flush any pending debounced save first — otherwise it fires after the
    // rename and rewrites the old path with pre-rename content, resurrecting
    // the file the rename just got rid of.
    await flushPendingSave(note.path);
    const newPath = await window.memoryStack.renameNote(note.path, newTitle, updateLinks);
    setOpenPaths((paths) => renameTab(paths, note.path, newPath));
    // Update activePath before refreshing notes — otherwise the "drop tabs
    // for notes that no longer exist" effect (keyed on the notes list) sees
    // the old path vanish from the freshly-reloaded notes while activePath
    // still points at it, and briefly clears the active note.
    if (activePath === note.path) setActivePath(newPath);
    await refresh({ showReindexing: true });
  }

  // Moves a note to a different member stack of the open Cairn. Unlike a
  // rename, the title (and therefore every [[link]] to it) doesn't change —
  // only the note's physical location and sourceStack do, so no link
  // rewriting is needed; the graph just re-resolves against the moved
  // note's new sourceStack on the next refresh.
  async function handleMoveNoteToStack(note: Note, destRoot: string) {
    try {
      await flushPendingSave(note.path);
      const newPath = await window.memoryStack.moveNoteToStack(note.path, destRoot);
      setOpenPaths((paths) => renameTab(paths, note.path, newPath));
      if (activePath === note.path) setActivePath(newPath);
      await refresh({ showReindexing: true });
    } catch (err) {
      window.alert(err instanceof Error ? err.message : String(err));
    }
  }

  async function handleCommitNoteRename(note: Note, newTitle: string) {
    setRenamingPath(null);
    if (!newTitle || newTitle === note.title) return;
    const backlinks = backlinkTitles(graph, note.title);
    if (backlinks.length === 0) {
      await performNoteRename(note, newTitle, false);
      return;
    }
    setDialog({ kind: "rename-links", note, newTitle, backlinks });
  }

  // Bind the commands core regions/views invoke by id. Re-registered every
  // render (cheap — a few Map.set calls) so handlers always close over
  // current state instead of going stale.
  useEffect(() => {
    pluginRegistry.registerCommand("stack.newNote", () =>
      handleNewNoteClick(window.innerWidth / 2, window.innerHeight / 2)
    );
    pluginRegistry.registerCommand("stack.openDailyNote", () =>
      handleOpenDailyNoteClick(window.innerWidth / 2, window.innerHeight / 2)
    );
    pluginRegistry.registerCommand("stack.switchStack", () => handleSwitchStack());
    pluginRegistry.registerCommand("stack.deleteNote", (note: Note) => requestDelete(note));
    pluginRegistry.registerCommand("stack.rename", (note: Note) => {
      setSidebarCollapsed(false);
      setRenamingPath(note.path);
    });
    pluginRegistry.registerCommand("view.toggleSidebar", () => setSidebarCollapsed((v) => !v));
    pluginRegistry.registerCommand("view.toggleRightPanel", () => setRightPanelCollapsed((v) => !v));
    pluginRegistry.registerCommand("view.openGraph", () => openTab(GRAPH_TAB_ID));
    pluginRegistry.registerCommand("view.openSettings", () => openTab(SETTINGS_TAB_ID));
    pluginRegistry.registerCommand("properties.manageSchema", (schemaRoot: string) =>
      setDialog({ kind: "manage-properties", root: schemaRoot })
    );
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

  if (!activeSession) {
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
          {stacks.length === 0 && cairns.length === 0 ? (
            <p>Add a folder of markdown notes to get started.</p>
          ) : (
            <ul className="stack-list">
              {cairns.map((c) => (
                <li key={`cairn:${c.name.toLowerCase()}`}>
                  <button
                    className="stack-list-item"
                    onClick={() => openCairnByEntry(c)}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      setStackContextMenu({ target: { type: "cairn", cairn: c }, x: e.clientX, y: e.clientY });
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "F2") {
                        e.preventDefault();
                        setDialog({ kind: "rename-cairn", cairn: c });
                        return;
                      }
                      if (e.key !== "Delete") return;
                      e.preventDefault();
                      handleRemoveCairn(c.name);
                    }}
                  >
                    <span className="stack-list-name">◆ {c.name}</span>
                    <span className="stack-list-path">{c.memberStackNames.join(", ")}</span>
                  </button>
                </li>
              ))}
              {stacks.map((v) => (
                <li key={v.name.toLowerCase()}>
                  <button
                    className="stack-list-item"
                    onClick={() => openStackByEntry(v)}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      setStackContextMenu({ target: { type: "stack", stack: v }, x: e.clientX, y: e.clientY });
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
          <div className="empty-state-actions">
            <button onClick={handlePickFolder}>+ Add Stack</button>
            {stacks.length >= 2 && (
              <button onClick={() => setDialog({ kind: "combine-stacks" })}>Combine stacks…</button>
            )}
          </div>
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
          {dialog?.kind === "rename-cairn" && (
            <PromptModal
              title="Rename Cairn to"
              initialValue={dialog.cairn.name}
              confirmLabel="Rename"
              onSubmit={handleRenameCairnSubmit}
              onCancel={() => setDialog(null)}
            />
          )}
          {dialog?.kind === "combine-stacks" && (
            <CombineStacksModal
              stacks={stacks}
              onSubmit={handleCombineStacksSubmit}
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
                  icon: <RenameIcon />,
                  onClick: () =>
                    stackContextMenu.target.type === "stack"
                      ? setDialog({ kind: "rename-stack", stack: stackContextMenu.target.stack })
                      : setDialog({ kind: "rename-cairn", cairn: stackContextMenu.target.cairn }),
                },
                {
                  label: "Delete",
                  shortcut: "Del",
                  icon: <DeleteIcon />,
                  onClick: () =>
                    stackContextMenu.target.type === "stack"
                      ? handleRemoveStack(stackContextMenu.target.stack.name)
                      : handleRemoveCairn(stackContextMenu.target.cairn.name),
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
          root={singleStackRoot}
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
            onNewNote={handleNewNoteClick}
            onOpenDailyNote={handleOpenDailyNoteClick}
            onGraphView={() => pluginRegistry.runCommand("view.openGraph")}
            onOpenSettings={() => pluginRegistry.runCommand("view.openSettings")}
            onNewNoteContextMenu={handleNewNoteContextMenu}
            onOpenHelp={() => setDialog({ kind: "shortcuts" })}
            regionId={regionId("left-ribbon")}
            ribbonItems={pluginRegistry.getRibbonItems()}
            onOpenRibbonItem={openRibbonItem}
          />
        )}

        {isRegionPresent("left-sidebar") && !sidebarCollapsed && (
          <TabbedRegion
            className="sidebar"
            region="left-sidebar"
            regionId={regionId("left-sidebar")}
            views={pluginRegistry.getViews("left-sidebar")}
            viewProps={{
              sessionKey,
              loading,
              notes,
              activePath,
              renamingPath,
              onShowInExplorer: showInExplorer,
              onSelect: (n: Note) => openTab(n.path),
              onDelete: (n: Note) => pluginRegistry.runCommand("stack.deleteNote", n),
              onRename: (n: Note) => pluginRegistry.runCommand("stack.rename", n),
              onCommitNoteRename: (n: Note, newTitle: string) => handleCommitNoteRename(n, newTitle),
              onCancelRename: () => setRenamingPath(null),
              onSeedStarterContent: activeSession.kind === "stack" ? handleSeedStarterContent : undefined,
              memberStacks: activeSession.kind === "cairn" ? activeSession.memberStacks : undefined,
              onMoveNoteToStack: (n: Note, destRoot: string) => handleMoveNoteToStack(n, destRoot),
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
              onCloseLeft={closeTabsLeftOf}
              onCloseRight={closeTabsRightOf}
              onCloseAll={closeAllTabs}
              onCloseOthers={closeOtherTabsOf}
              isFileTab={(id) => !isSentinelTabId(id)}
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
                onSaved: () => refresh(),
                onSelectTitle: selectByTitle,
                onOpenExternal: openExternal,
                settings,
                onChange: updateSettings,
                theme: resolvedTheme,
                schema: activeNoteSchema,
                onSaveProperties: saveNoteProperties,
                onOpenSchemaManager: () =>
                  activeNoteRoot && pluginRegistry.runCommand("properties.manageSchema", activeNoteRoot),
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
            region="right-sidebar"
            regionId={regionId("right-sidebar")}
            views={pluginRegistry.getViews("right-sidebar")}
            viewProps={{
              note: activeNote,
              graph,
              schema: activeNoteSchema,
              activeTitle: activeNote?.title ?? null,
              onSelectTitle: selectByTitle,
              onOpenExternal: openExternal,
              onSaveProperties: saveNoteProperties,
              onOpenSchemaManager: () =>
                activeNoteRoot && pluginRegistry.runCommand("properties.manageSchema", activeNoteRoot),
              reconciling,
            }}
          />
        )}

        {dialog?.kind === "confirm-delete" && (
          <ConfirmModal
            title="Delete note"
            message={deleteConfirmMessage(dialog.note)}
            confirmLabel="Delete"
            onConfirm={(dontAskAgain) => {
              if (dontAskAgain) setSkipDeleteConfirm(true);
              performDeleteNote(dialog.note);
              setDialog(null);
            }}
            onCancel={() => setDialog(null)}
          />
        )}
        {dialog?.kind === "rename-links" && (
          <ConfirmModal
            title="Update links to this note?"
            message={`${dialog.backlinks.length} other note${
              dialog.backlinks.length === 1 ? "" : "s"
            } link${dialog.backlinks.length === 1 ? "s" : ""} to "${dialog.note.title}". Update ${
              dialog.backlinks.length === 1 ? "it" : "them"
            } to point to "${dialog.newTitle}"?`}
            confirmLabel="Update links"
            cancelLabel="Don't update"
            showDontAskAgain={false}
            onConfirm={() => {
              const { note, newTitle } = dialog;
              setDialog(null);
              performNoteRename(note, newTitle, true);
            }}
            onCancel={() => {
              const { note, newTitle } = dialog;
              setDialog(null);
              performNoteRename(note, newTitle, false);
            }}
          />
        )}
        {dialog?.kind === "manage-properties" && (
          <PropertySchemaModal
            schema={propertySchemas[dialog.root] ?? []}
            onSave={async (updated) => {
              await saveSchema(dialog.root, updated);
              setDialog(null);
            }}
            onClose={() => setDialog(null)}
          />
        )}
        {dialog?.kind === "shortcuts" && (
          <ShortcutsPanel
            onReplayTour={() => {
              setDialog(null);
              setShowTour(true);
            }}
            onClose={() => setDialog(null)}
          />
        )}
        {showTour && <OnboardingTour onClose={dismissTour} />}
        {templateMenu && (
          <ContextMenu
            x={templateMenu.x}
            y={templateMenu.y}
            items={
              activeSession.kind === "cairn"
                ? activeSession.memberStacks.map((stack) => ({
                    label: stack.name,
                    children: NOTE_TEMPLATES.map((template) => ({
                      label: template.label,
                      onClick: () => handleCreateNote(stack.root, template.id),
                    })),
                  }))
                : NOTE_TEMPLATES.map((template) => ({
                    label: template.label,
                    onClick: () => handleCreateNote(activeSession.entry.root, template.id),
                  }))
            }
            onClose={() => setTemplateMenu(null)}
          />
        )}
        {dailyNoteMenu && activeSession.kind === "cairn" && (
          <ContextMenu
            x={dailyNoteMenu.x}
            y={dailyNoteMenu.y}
            items={activeSession.memberStacks.map((stack) => ({
              label: stack.name,
              onClick: () => handleOpenDailyNote(stack.root),
            }))}
            onClose={() => setDailyNoteMenu(null)}
          />
        )}
      </div>

      {isRegionPresent("status-bar") && (
        <StatusBar note={activeNote} graph={graph} regionId={regionId("status-bar")} />
      )}
    </div>
  );
}
