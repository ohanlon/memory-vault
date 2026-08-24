import { useCallback, useEffect, useMemo, useState } from "react";
import { useVault } from "./vault/useVault";
import { ActivityBar } from "./components/ActivityBar";
import { FileTree } from "./components/FileTree";
import { EditorPane } from "./components/EditorPane";
import { GraphPanel } from "./components/GraphPanel";
import { RightPanel } from "./components/RightPanel";
import { StatusBar } from "./components/StatusBar";
import { PropertySchemaModal } from "./components/PropertySchemaModal";
import { PromptModal } from "./components/PromptModal";
import { TabBar, type TabItem } from "./components/TabBar";
import { addTab as addTabPath, GRAPH_TAB_ID, reconcileTabs, removeTab, renameTab } from "./vault/tabs";
import { stripMdExtension } from "@shared/displayName";
import { defaultLayouts, findLayout, getRegion, hasRegion } from "@shared/layouts";
import type { LayoutRegionName, Note } from "@shared/types";

// Which named layout drives the screen. No UI to switch layouts yet — the
// data model (shared/layouts.json) already supports more than one.
const ACTIVE_LAYOUT_NAME = "default";

type DialogState =
  | { kind: "new-note" }
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
    if (!root) return;
    const newPath = await window.memoryVault.createNote(root, title);
    await refresh();
    openTab(newPath);
    setDialog(null);
  }

  async function handleDelete(note: Note) {
    if (!window.confirm(`Delete "${stripMdExtension(note.relativePath)}"?`)) return;
    await window.memoryVault.deleteNote(note.path);
    closeTab(note.path);
    await refresh();
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

  if (!root) {
    return (
      <div className="app-shell">
        {isRegionPresent("title-bar") && (
          <div className="titlebar-drag" data-region-id={regionId("title-bar")} />
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
      {isRegionPresent("title-bar") && (
        <div className="titlebar-drag" data-region-id={regionId("title-bar")}>
          {isRegionPresent("right-sidebar") && (
            <button
              className="titlebar-collapse-btn"
              onClick={() => setRightPanelCollapsed((v) => !v)}
              title={rightPanelCollapsed ? "Show right panel" : "Hide right panel"}
            >
              {rightPanelCollapsed ? "»" : "«"}
            </button>
          )}
        </div>
      )}
      <div
        className={`app-layout${sidebarCollapsed ? " sidebar-collapsed" : ""}${
          rightPanelCollapsed ? " right-panel-collapsed" : ""
        }`}
      >
        {isRegionPresent("left-ribbon") && (
          <ActivityBar
            sidebarCollapsed={sidebarCollapsed}
            onToggleSidebar={() => setSidebarCollapsed((v) => !v)}
            onNewNote={() => setDialog({ kind: "new-note" })}
            onGraphView={() => openTab(GRAPH_TAB_ID)}
            regionId={regionId("left-ribbon")}
          />
        )}

        {isRegionPresent("left-sidebar") && !sidebarCollapsed && (
          <aside className="sidebar" data-region-id={regionId("left-sidebar")}>
            <div className="sidebar-header">
              <span title={root}>{activeName ?? root.split(/[\\/]/).pop()}</span>
              <button onClick={handleSwitchVault} title="Switch to a different vault">
                Switch
              </button>
            </div>
            {loading && <div className="loading">Loading...</div>}
            <FileTree
              notes={notes}
              activePath={activePath}
              onSelect={(n) => openTab(n.path)}
              onDelete={handleDelete}
            />
          </aside>
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
            {activePath === GRAPH_TAB_ID ? (
              <GraphPanel
                graph={graph}
                activeTitle={activeNote?.title ?? null}
                onSelectTitle={selectByTitle}
                onOpenExternal={openExternal}
              />
            ) : (
              <EditorPane
                note={activeNote}
                onSaved={refresh}
                onSelectTitle={selectByTitle}
                onOpenExternal={openExternal}
              />
            )}
          </main>
        )}

        {isRegionPresent("right-sidebar") && !rightPanelCollapsed && (
          <RightPanel
            note={activeNote}
            graph={graph}
            schema={propertySchema}
            onSelectTitle={selectByTitle}
            onOpenExternal={openExternal}
            onSaveProperties={saveNoteProperties}
            onOpenSchemaManager={() => setDialog({ kind: "manage-properties" })}
            regionId={regionId("right-sidebar")}
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
