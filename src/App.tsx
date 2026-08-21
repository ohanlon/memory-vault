import { useCallback, useMemo, useState } from "react";
import { useVault } from "./vault/useVault";
import { FileTree } from "./components/FileTree";
import { EditorPane } from "./components/EditorPane";
import { GraphPanel } from "./components/GraphPanel";
import { BacklinksPanel } from "./components/BacklinksPanel";
import { PromptModal } from "./components/PromptModal";
import type { Note } from "@shared/types";

type DialogState =
  | { kind: "new-note" }
  | { kind: "rename"; note: Note }
  | { kind: "name-vault"; root: string }
  | null;

export default function App() {
  const {
    vaults,
    activeName,
    root,
    notes,
    graph,
    loading,
    error,
    openVaultByEntry,
    addVault,
    removeVault,
    closeVault,
    refresh,
  } = useVault();
  const [activePath, setActivePath] = useState<string | null>(null);
  const [dialog, setDialog] = useState<DialogState>(null);

  const activeNote = useMemo(
    () => notes.find((n) => n.path === activePath) ?? null,
    [notes, activePath]
  );

  const selectByTitle = useCallback(
    (title: string) => {
      const found = notes.find((n) => n.title === title);
      if (found) setActivePath(found.path);
    },
    [notes]
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
      setActivePath(null);
    } catch (err) {
      window.alert(err instanceof Error ? err.message : String(err));
      // keep the dialog open so the user can retry with a different name
    }
  }

  async function handleRemoveVault(name: string) {
    if (!window.confirm(`Remove vault "${name}" from the list? The folder itself is untouched.`)) return;
    await removeVault(name);
  }

  async function handleCreateNote(title: string) {
    if (!root) return;
    const newPath = await window.memoryVault.createNote(root, title);
    await refresh();
    setActivePath(newPath);
    setDialog(null);
  }

  async function handleDelete(note: Note) {
    if (!window.confirm(`Delete "${note.relativePath}"?`)) return;
    await window.memoryVault.deleteNote(note.path);
    if (activePath === note.path) setActivePath(null);
    await refresh();
  }

  async function handleRenameSubmit(newTitle: string) {
    if (dialog?.kind !== "rename") return;
    const note = dialog.note;
    setDialog(null);
    if (newTitle === note.title) return;
    const newPath = await window.memoryVault.renameNote(note.path, newTitle);
    await refresh();
    setActivePath(newPath);
  }

  if (!root) {
    return (
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
    );
  }

  return (
    <div className="app-layout">
      <aside className="sidebar">
        <div className="sidebar-header">
          <span title={root}>{activeName ?? root.split(/[\\/]/).pop()}</span>
          <button onClick={closeVault} title="Switch to a different vault">
            Switch
          </button>
        </div>
        <button className="new-note-btn" onClick={() => setDialog({ kind: "new-note" })}>
          + New note
        </button>
        {loading && <div className="loading">Loading...</div>}
        <FileTree
          notes={notes}
          activePath={activePath}
          onSelect={(n) => setActivePath(n.path)}
          onDelete={handleDelete}
        />
      </aside>

      <main className="editor-area">
        {activeNote && (
          <div className="editor-toolbar">
            <button onClick={() => setDialog({ kind: "rename", note: activeNote })}>
              Rename
            </button>
          </div>
        )}
        <EditorPane
          note={activeNote}
          onSaved={refresh}
          onSelectTitle={selectByTitle}
          onOpenExternal={openExternal}
        />
      </main>

      <aside className="right-panel">
        <GraphPanel
          graph={graph}
          activeTitle={activeNote?.title ?? null}
          onSelectTitle={selectByTitle}
          onOpenExternal={openExternal}
        />
        <BacklinksPanel
          graph={graph}
          activeTitle={activeNote?.title ?? null}
          onSelectTitle={selectByTitle}
          onOpenExternal={openExternal}
        />
      </aside>

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
    </div>
  );
}
