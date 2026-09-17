import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNotesFolders } from "./notesFolder/useNotesFolders";
import { StatusBar } from "./components/StatusBar";
import { ResizeHandle } from "./components/ResizeHandle";
import { PropertySchemaModal } from "./components/PropertySchemaModal";
import { PromptModal } from "./components/PromptModal";
import { ConfirmModal } from "./components/ConfirmModal";
import { ContextMenu, type ContextMenuEntry } from "./components/ContextMenu";
import { TemplatePlaceholdersModal } from "./components/TemplatePlaceholdersModal";
import { ShortcutsPanel } from "./components/ShortcutsPanel";
import { HintToast } from "./components/HintToast";
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
} from "./notesFolder/tabs";
import { EntryAvatar } from "./components/EntryAvatar";
import { basename, stripMdExtension } from "@shared/displayName";
import { backlinkTitles } from "@shared/buildGraph";
import { defaultLayouts, findLayout, getRegion, hasRegion } from "@shared/layouts";
import { DEFAULT_LAYOUT_PREFS, MAX_SIDEBAR_WIDTH, MIN_SIDEBAR_WIDTH } from "@shared/layoutPrefs";
import { DEFAULT_APP_SETTINGS } from "@shared/appSettings";
import { NOTE_TEMPLATES } from "@shared/noteTemplates";
import { templatePlaceholders } from "@shared/templateRender";
import { defaultColorsFor } from "@shared/themeColors";
import type { AppSettings, FileTemplate, LayoutRegionName, Note, NotesFolderEntry } from "@shared/types";
import { applyCustomThemeProperties, clearCustomThemeProperties } from "./applyCustomTheme";

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

type DialogState =
  | { kind: "name-notes-folder"; root: string }
  | { kind: "rename-notes-folder"; notesFolder: NotesFolderEntry }
  | { kind: "manage-properties"; root: string }
  | { kind: "confirm-delete"; note: Note }
  | { kind: "rename-links"; note: Note; newTitle: string; backlinks: string[] }
  | { kind: "shortcuts" }
  | { kind: "fill-template"; dir: string; templatePath: string; placeholders: string[] }
  | null;

type NotesFolderContextMenuState = { notesFolder: NotesFolderEntry; x: number; y: number };

export default function App() {
  const {
    notesFolders,
    activeNotesFolder,
    notes,
    graph,
    propertySchemas,
    loading,
    error,
    reconciling,
    openNotesFolderByEntry,
    addNotesFolder,
    removeNotesFolder,
    renameNotesFolder,
    closeNotesFolder,
    refresh,
    saveSchema,
    saveNoteProperties,
  } = useNotesFolders();
  const [openPaths, setOpenPaths] = useState<string[]>([]);
  const [activePath, setActivePath] = useState<string | null>(null);
  const [renamingPath, setRenamingPath] = useState<string | null>(null);
  // Note-shaped data for any template currently open as a tab — templates
  // are deliberately excluded from the main `notes` array (see
  // electron/templates.ts), so this is a small parallel lookup rather than
  // folding them into `notes` and having to filter them back out of the
  // graph/search/backlinks/link-picker everywhere that array is consumed.
  const [templateNotesByPath, setTemplateNotesByPath] = useState<Record<string, Note>>({});
  // Which session (a notes folder's root) a workspace-state restore has
  // been kicked off for, so a refresh() of the same session doesn't
  // retrigger it — reset to null when the session closes so reopening it
  // (or a different one) restores again.
  const restoreStartedSessionRef = useRef<string | null>(null);
  // Which session restored data has actually landed for — gates saving so
  // the debounced save effect can't write back stale pre-restore state.
  const restoredReadySessionRef = useRef<string | null>(null);
  const workspaceSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [dialog, setDialog] = useState<DialogState>(null);
  const [notesFolderContextMenu, setNotesFolderContextMenu] = useState<NotesFolderContextMenuState | null>(null);
  const [skipDeleteConfirm, setSkipDeleteConfirm] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [rightPanelCollapsed, setRightPanelCollapsed] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(DEFAULT_LAYOUT_PREFS.sidebarWidth);
  const [rightPanelWidth, setRightPanelWidth] = useState(DEFAULT_LAYOUT_PREFS.rightPanelWidth);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_APP_SETTINGS);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [activeHint, setActiveHint] = useState<{ kind: "wikilink" | "tag" | "graph"; message: string } | null>(null);
  // Template picker menu shown for "New Note" via right-click (see
  // handleNewNoteContextMenu).
  const [templateMenu, setTemplateMenu] = useState<{ x: number; y: number } | null>(null);
  // Every file template in the currently open notes folder. See loadFileTemplates.
  const [allTemplates, setAllTemplates] = useState<FileTemplate[]>([]);
  const [resolvedTheme, setResolvedTheme] = useState<"dark" | "light">("dark");
  const activeName = activeNotesFolder?.name ?? null;
  const notesFolderRoot = activeNotesFolder?.root ?? null;
  // Stable identity for the currently-open session, used to gate the
  // workspace-state restore/save effects below.
  const sessionKey = activeNotesFolder?.root ?? null;
  // Mirrors the two widths above so the drag-end handler can save the exact
  // latest value without waiting for a re-render to read fresh state.
  const widthsRef = useRef(DEFAULT_LAYOUT_PREFS);

  // Resolves the theme setting (built-in, "system", or a user's custom
  // theme) against the OS preference where relevant, reflects the result on
  // <html> so index.css's [data-theme] rules apply, and — for "custom" —
  // layers the theme's own colors on top as inline CSS variables (highest
  // specificity, so they cleanly override whichever built-in block is
  // otherwise in effect). Also stays in sync if the OS preference changes
  // while "system" is active, or if the active custom theme is edited.
  useEffect(() => {
    const theme = settings.theme;
    const media = window.matchMedia("(prefers-color-scheme: light)");
    function apply() {
      // Unconditional and safe (a no-op for anything not currently set) —
      // guarantees a custom theme's colors never leak into a built-in one.
      clearCustomThemeProperties(document.documentElement);

      if (theme === "custom") {
        const custom = settings.customThemes.find((t) => t.id === settings.activeCustomThemeId);
        if (custom) {
          applyCustomThemeProperties(document.documentElement, custom);
          setResolvedTheme(custom.baseMode);
          document.documentElement.dataset.theme = custom.baseMode;
          window.memoryStack.setTitleBarOverlay({
            color: custom.colors["bg-base"],
            symbolColor: custom.colors["text-primary"],
          });
          return;
        }
        // activeCustomThemeId doesn't resolve (deleted theme, corrupt settings) — fall through to dark below.
      }

      const resolved = theme === "system" ? (media.matches ? "light" : "dark") : theme === "custom" ? "dark" : theme;
      setResolvedTheme(resolved);
      document.documentElement.dataset.theme = resolved;
      const builtIn = defaultColorsFor(resolved);
      window.memoryStack.setTitleBarOverlay({ color: builtIn["bg-base"], symbolColor: builtIn["text-primary"] });
    }
    apply();
    if (theme !== "system") return;
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [settings.theme, settings.customThemes, settings.activeCustomThemeId]);

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

  // Shows a one-time tip the first time the user does the thing it explains
  // (starts a wikilink, types a tag, opens the graph) instead of front-loading
  // all of them in a tour before the user has written anything. settingsLoaded
  // gates this so a hint can't wrongly re-fire before the real persisted
  // "seen" values have loaded in.
  function showHint(kind: "wikilink" | "tag" | "graph") {
    if (!settingsLoaded) return;
    const key = kind === "wikilink" ? "hasSeenWikilinkHint" : kind === "tag" ? "hasSeenTagHint" : "hasSeenGraphHint";
    if (settings[key]) return;
    const message =
      kind === "wikilink"
        ? "Notes link to each other with [[double brackets]] — keep typing to search, then pick one."
        : kind === "tag"
          ? "Tags like this connect every note that shares it — see them together in the graph view."
          : "This is your notes graph. Every link and tag becomes a connection — click a node to jump to it.";
    setActiveHint({ kind, message });
    updateSettings({ ...settings, [key]: true });
  }

  function resetHints() {
    updateSettings({ ...settings, hasSeenWikilinkHint: false, hasSeenTagHint: false, hasSeenGraphHint: false });
  }

  // Graph view has no per-keystroke trigger to hook like the editor hints do
  // — just watch for the graph tab becoming active.
  useEffect(() => {
    if (activePath === GRAPH_TAB_ID) showHint("graph");
  }, [activePath]);

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
    () => notes.find((n) => n.path === activePath) ?? (activePath ? templateNotesByPath[activePath] ?? null : null),
    [notes, activePath, templateNotesByPath]
  );

  const activeGraphNodeId = useMemo(
    () => (activeNote ? graph.nodes.find((n) => n.path === activeNote.path)?.id ?? activeNote.title : null),
    [activeNote, graph]
  );

  const activeNoteSchema = notesFolderRoot ? propertySchemas[notesFolderRoot] ?? [] : [];

  const openTabItems = useMemo<TabItem[]>(
    () =>
      openPaths
        .map((p): TabItem | null => {
          if (isSentinelTabId(p)) {
            const kind = pluginRegistry.getTabKind(p);
            return kind ? { id: p, label: kind.title } : null;
          }
          const note = notes.find((n) => n.path === p);
          if (!note) {
            const templateNote = templateNotesByPath[p];
            if (templateNote) return { id: p, label: `${templateNote.title} (Template)` };
            return null;
          }
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
    [openPaths, notes, templateNotesByPath, settings.tabFolderDisplay]
  );

  // Drop tabs (and clear the active tab) for notes that no longer exist —
  // e.g. deleted or renamed externally, outside the app's own delete/rename flows.
  // The graph tab is never dropped this way — it isn't a note. Open template
  // tabs are kept alive the same way, via templateNotesByPath.
  useEffect(() => {
    const existing = new Set([...notes.map((n) => n.path), ...Object.keys(templateNotesByPath)]);
    setOpenPaths((paths) => reconcileTabs(paths, existing));
    setActivePath((path) => (path === null || path === GRAPH_TAB_ID || existing.has(path) ? path : null));
  }, [notes, templateNotesByPath]);

  // Reads the currently open notes folder's <root>/.cairn/workspace.json.
  const readActiveWorkspaceState = useCallback(() => {
    if (!activeNotesFolder) return Promise.resolve(null);
    return window.memoryStack.readWorkspaceState();
  }, [activeNotesFolder]);

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
    if (!activeNotesFolder || !sessionKey || restoredReadySessionRef.current !== sessionKey) return;
    if (workspaceSaveTimer.current) clearTimeout(workspaceSaveTimer.current);
    workspaceSaveTimer.current = setTimeout(() => {
      const openTabs = openPaths
        .map((id) => tabIdToTabRef(id, notes))
        .filter((r): r is NonNullable<typeof r> => r !== null);
      const activeTab = activePath ? tabIdToTabRef(activePath, notes) : null;
      window.memoryStack.saveWorkspaceState({ openTabs, activeTab });
    }, 300);
    return () => {
      if (workspaceSaveTimer.current) clearTimeout(workspaceSaveTimer.current);
    };
  }, [activeNotesFolder, sessionKey, openPaths, activePath, notes]);

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
      if (!notesFolderRoot) return;
      // Clicking an unresolved wikilink creates it in the open notes folder.
      window.memoryStack.createNote(notesFolderRoot, title).then(async (newPath) => {
        await refresh();
        openTab(newPath);
      });
    },
    [notes, openTab, notesFolderRoot, refresh]
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
    const root = await window.memoryStack.pickNotesFolder();
    if (root) setDialog({ kind: "name-notes-folder", root });
  }

  async function handleNameNotesFolderSubmit(name: string) {
    if (dialog?.kind !== "name-notes-folder") return;
    await addNotesFolder(name, dialog.root); // rejection surfaces inline in the dialog; it stays open to retry
    setDialog(null);
    setOpenPaths([]);
    setActivePath(null);
  }

  function handleSwitchNotesFolder() {
    setOpenPaths([]);
    setActivePath(null);
    closeNotesFolder();
  }

  async function handleRemoveNotesFolder(name: string) {
    if (!window.confirm(`Remove "${name}" from the list? The folder itself is untouched.`)) return;
    await removeNotesFolder(name);
  }

  async function handleRenameNotesFolderSubmit(newName: string) {
    if (dialog?.kind !== "rename-notes-folder") return;
    const oldName = dialog.notesFolder.name;
    await renameNotesFolder(oldName, newName); // rejection surfaces inline in the dialog; it stays open to retry
    setDialog(null);
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

  async function handleOpenDailyNote(root: string) {
    const result = await window.memoryStack.openOrCreateDailyNote(root);
    if (result.created) await refresh();
    openTab(result.path);
  }

  function handleNewNoteClick() {
    if (!activeNotesFolder) return;
    handleCreateNote(activeNotesFolder.root);
  }

  async function handleNewNoteContextMenu(x: number, y: number) {
    if (!activeNotesFolder) return;
    await loadFileTemplates();
    setTemplateMenu({ x, y });
  }

  function handleOpenDailyNoteClick() {
    if (!activeNotesFolder) return;
    handleOpenDailyNote(activeNotesFolder.root);
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

  async function handleConvertToTemplate(note: Note) {
    if (!notesFolderRoot) return;
    try {
      // Otherwise a just-edited note's debounced save could land after this
      // reads the file, and the template would capture the stale pre-edit content.
      await flushPendingSave(note.path);
      await window.memoryStack.convertToTemplate(notesFolderRoot, note.path);
      await loadFileTemplates();
      window.alert(`Saved "${note.title}" as a template — see it under Templates in the sidebar.`);
    } catch (err) {
      window.alert(err instanceof Error ? err.message : String(err));
    }
  }

  // The .templates folder is excluded from the file watcher (same dotfolder
  // rule as everything else under it), so nothing else refreshes this
  // automatically.
  async function loadFileTemplates() {
    setAllTemplates(await window.memoryStack.listFileTemplates());
  }

  useEffect(() => {
    loadFileTemplates();
  }, []);

  async function openTemplateTab(template: FileTemplate) {
    setSidebarCollapsed(false);
    const note = await window.memoryStack.readNote(template.path);
    setTemplateNotesByPath((prev) => ({ ...prev, [template.path]: note }));
    openTab(template.path);
  }

  async function handleDeleteTemplate(template: FileTemplate) {
    if (!window.confirm(`Delete template "${template.name}"? This can't be undone.`)) return;
    await window.memoryStack.deleteNote(template.path);
    closeTab(template.path);
    setTemplateNotesByPath((prev) => {
      const next = { ...prev };
      delete next[template.path];
      return next;
    });
    await loadFileTemplates();
  }

  function templatePickerEntries(root: string): ContextMenuEntry[] {
    const builtIns: ContextMenuEntry[] = NOTE_TEMPLATES.map((template) => ({
      label: template.label,
      onClick: () => handleCreateNote(root, template.id),
    }));
    if (allTemplates.length === 0) return builtIns;
    return [
      ...builtIns,
      { separator: true as const },
      ...allTemplates.map((template) => ({
        label: template.name,
        onClick: () => handleCreateNoteFromTemplate(root, template),
      })),
    ];
  }

  // Prompts for any {{placeholder}} the template has (skipping the modal
  // entirely when there are none) before actually writing the new note.
  async function handleCreateNoteFromTemplate(dir: string, template: FileTemplate) {
    const raw = await window.memoryStack.readRaw(template.path);
    const placeholders = templatePlaceholders(raw);
    if (placeholders.length === 0) {
      await finishCreateNoteFromTemplate(dir, template.path, {});
      return;
    }
    setDialog({ kind: "fill-template", dir, templatePath: template.path, placeholders });
  }

  async function finishCreateNoteFromTemplate(dir: string, templatePath: string, values: Record<string, string>) {
    setSidebarCollapsed(false);
    const newPath = await window.memoryStack.createNoteFromTemplate(dir, "", templatePath, values);
    await refresh();
    openTab(newPath);
    setRenamingPath(newPath);
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
    pluginRegistry.registerCommand("stack.newNote", () => handleNewNoteClick());
    pluginRegistry.registerCommand("stack.openDailyNote", () => handleOpenDailyNoteClick());
    pluginRegistry.registerCommand("stack.switchStack", () => handleSwitchNotesFolder());
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

  if (!activeNotesFolder) {
    const notesFolderContextMenuItems: ContextMenuEntry[] | null = notesFolderContextMenu
      ? [
          {
            label: "Rename",
            shortcut: "F2",
            icon: <RenameIcon />,
            onClick: () => setDialog({ kind: "rename-notes-folder", notesFolder: notesFolderContextMenu.notesFolder }),
          },
          {
            label: "Delete",
            shortcut: "Del",
            icon: <DeleteIcon />,
            onClick: () => handleRemoveNotesFolder(notesFolderContextMenu.notesFolder.name),
          },
        ]
      : null;

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
          {notesFolders.length === 0 ? (
            <p>Add a folder of markdown notes to get started.</p>
          ) : (
            <div className="notes-folder-sections">
              <section className="notes-folder-section">
                <h2 className="notes-folder-section-label">Notes</h2>
                <ul className="notes-folder-grid">
                  {notesFolders.map((v) => (
                    <li key={v.name.toLowerCase()}>
                      <div
                        className="notes-folder-list-item"
                        role="button"
                        tabIndex={0}
                        onClick={() => openNotesFolderByEntry(v)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            openNotesFolderByEntry(v);
                            return;
                          }
                          if (e.key === "F2") {
                            e.preventDefault();
                            setDialog({ kind: "rename-notes-folder", notesFolder: v });
                            return;
                          }
                          if (e.key !== "Delete") return;
                          e.preventDefault();
                          handleRemoveNotesFolder(v.name);
                        }}
                      >
                        <EntryAvatar name={v.name} avatar={v.avatar} size={128} className="notes-folder-list-avatar" />
                        <div className="notes-folder-list-row">
                          <span className="notes-folder-list-text">
                            <span className="notes-folder-list-name">{v.name}</span>
                            <span className="notes-folder-list-path">{v.root}</span>
                          </span>
                          <button
                            type="button"
                            className="notes-folder-list-menu-trigger"
                            aria-label={`${v.name} options`}
                            onClick={(e) => {
                              e.stopPropagation();
                              const rect = e.currentTarget.getBoundingClientRect();
                              setNotesFolderContextMenu({ notesFolder: v, x: rect.left, y: rect.bottom + 4 });
                            }}
                          >
                            ⋮
                          </button>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            </div>
          )}
          <div className="empty-state-actions">
            <button onClick={handlePickFolder}>+ Add notes folder</button>
          </div>
          {error && <p className="error">{error}</p>}

          {dialog?.kind === "name-notes-folder" && (
            <PromptModal
              title="Name this notes folder"
              initialValue={basename(dialog.root)}
              confirmLabel="Add"
              onSubmit={handleNameNotesFolderSubmit}
              onCancel={() => setDialog(null)}
            />
          )}
          {dialog?.kind === "rename-notes-folder" && (
            <PromptModal
              title="Rename notes folder to"
              initialValue={dialog.notesFolder.name}
              confirmLabel="Rename"
              onSubmit={handleRenameNotesFolderSubmit}
              onCancel={() => setDialog(null)}
            />
          )}
          {notesFolderContextMenu && notesFolderContextMenuItems && (
            <ContextMenu
              x={notesFolderContextMenu.x}
              y={notesFolderContextMenu.y}
              items={notesFolderContextMenuItems}
              onClose={() => setNotesFolderContextMenu(null)}
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
          root={notesFolderRoot}
          onSwitchNotesFolder={() => pluginRegistry.runCommand("stack.switchStack")}
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
              onConvertToTemplate: (n: Note) => handleConvertToTemplate(n),
              onCommitNoteRename: (n: Note, newTitle: string) => handleCommitNoteRename(n, newTitle),
              onCancelRename: () => setRenamingPath(null),
              onSeedStarterContent: handleSeedStarterContent,
              templates: allTemplates,
              onSelectTemplate: (t: FileTemplate) => openTemplateTab(t),
              onDeleteTemplate: (t: FileTemplate) => handleDeleteTemplate(t),
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
                notes,
                activeTitle: activeGraphNodeId,
                onSaved: () => refresh(),
                onSelectTitle: selectByTitle,
                onOpenExternal: openExternal,
                settings,
                onChange: updateSettings,
                theme: resolvedTheme,
                schema: activeNoteSchema,
                onSaveProperties: saveNoteProperties,
                canManageProperties: !!notesFolderRoot,
                onManageProperties: () =>
                  notesFolderRoot && pluginRegistry.runCommand("properties.manageSchema", notesFolderRoot),
                onWikilinkStarted: () => showHint("wikilink"),
                onTagTyped: () => showHint("tag"),
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
              activeTitle: activeGraphNodeId,
              onSelectTitle: selectByTitle,
              onOpenExternal: openExternal,
              onSaveProperties: saveNoteProperties,
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
            onResetHints={() => {
              setDialog(null);
              resetHints();
            }}
            onClose={() => setDialog(null)}
          />
        )}
        {activeHint && <HintToast message={activeHint.message} onDismiss={() => setActiveHint(null)} />}
        {templateMenu && (
          <ContextMenu
            x={templateMenu.x}
            y={templateMenu.y}
            items={templatePickerEntries(activeNotesFolder.root)}
            onClose={() => setTemplateMenu(null)}
          />
        )}
        {dialog?.kind === "fill-template" && (
          <TemplatePlaceholdersModal
            placeholders={dialog.placeholders}
            onSubmit={async (values) => {
              setDialog(null);
              await finishCreateNoteFromTemplate(dialog.dir, dialog.templatePath, values);
            }}
            onCancel={() => setDialog(null)}
          />
        )}
      </div>

      {isRegionPresent("status-bar") && (
        <StatusBar note={activeNote} graph={graph} regionId={regionId("status-bar")} />
      )}
    </div>
  );
}
