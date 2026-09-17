import { useCallback, useEffect, useRef, useState } from "react";
import type { GraphModel, Note, NotesFolderEntry, PropertyDef } from "@shared/types";
import { buildGraph } from "@shared/buildGraph";
import { loadThirdPartyPlugins } from "../plugins/loader";

export interface NotesFoldersState {
  notesFolders: NotesFolderEntry[];
  activeNotesFolder: NotesFolderEntry | null;
  notes: Note[];
  graph: GraphModel;
  /** Property schema for the currently-open notes folder's root, keyed by
   *  that root path. */
  propertySchemas: Record<string, PropertyDef[]>;
  loading: boolean;
  error: string | null;
  /** True while the active root's background reconciliation pass (kicked
   *  off by openNotesFolder) is still in progress. */
  reconciling: boolean;
}

const EMPTY_GRAPH: GraphModel = { nodes: [], edges: [] };

export function useNotesFolders() {
  const [state, setState] = useState<NotesFoldersState>({
    notesFolders: [],
    activeNotesFolder: null,
    notes: [],
    graph: EMPTY_GRAPH,
    propertySchemas: {},
    loading: false,
    error: null,
    reconciling: false,
  });
  const reloadTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Mirrors the currently open root outside React state so the
  // reconciliation listeners (registered once, empty dep array) always see
  // the latest value without needing state in their dependency array.
  const activeRootRef = useRef<string | null>(null);

  useEffect(() => {
    window.memoryStack.listNotesFolders().then((notesFolders) => setState((s) => ({ ...s, notesFolders })));
  }, []);

  // Opens/switches to a notes folder. The main process serves this from a
  // persisted per-vault cache when one exists (near-instant, whole vault at
  // once), only falling back to a full synchronous parse on that vault's
  // very first open. A background reconciliation pass then catches up any
  // changes made to the vault outside the app (see the onReconciled
  // listener below).
  const openNotesFolder = useCallback(async (entry: NotesFolderEntry) => {
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const [index, propertySchema] = await Promise.all([
        window.memoryStack.loadNotesFolder(entry.root),
        window.memoryStack.readPropertySchema(entry.root),
      ]);
      activeRootRef.current = entry.root;
      setState((s) => ({
        ...s,
        activeNotesFolder: entry,
        notes: index.notes,
        graph: buildGraph(index.notes),
        propertySchemas: { [entry.root]: propertySchema },
        loading: false,
        error: null,
        // notesFolder:load always kicks off a background reconciliation pass
        // right after it resolves (see main.ts) — reflect that here rather
        // than waiting on a separate IPC "started" event, which could
        // otherwise race this state update (arriving before
        // activeNotesFolder is set below).
        reconciling: true,
      }));
      await loadThirdPartyPlugins();
    } catch (err) {
      setState((s) => ({ ...s, loading: false, error: String(err) }));
    }
  }, []);

  // The background reconciliation pass (kicked off by openNotesFolder)
  // found the root's on-disk contents differ from the cache it served
  // initially — replace the notes and rebuild the graph.
  useEffect(() => {
    const unsubscribe = window.memoryStack.onReconciled(({ root: eventRoot, notes }) => {
      if (activeRootRef.current !== eventRoot) return; // stale event for a root we've since left
      setState((s) => ({ ...s, notes, graph: buildGraph(notes) }));
    });
    return unsubscribe;
  }, []);

  // The background reconciliation pass has finished, whether or not it
  // found anything to change.
  useEffect(() => {
    const unsubscribe = window.memoryStack.onReconcileStatus(({ root: eventRoot, reconciling }) => {
      if (activeRootRef.current !== eventRoot) return;
      setState((s) => ({ ...s, reconciling }));
    });
    return unsubscribe;
  }, []);

  const openNotesFolderByEntry = useCallback((entry: NotesFolderEntry) => openNotesFolder(entry), [openNotesFolder]);

  const addNotesFolderToRegistry = useCallback(async (name: string, root: string) => {
    const notesFolders = await window.memoryStack.addNotesFolder(name, root); // throws on empty/duplicate name
    setState((s) => ({ ...s, notesFolders }));
  }, []);

  const addNotesFolder = useCallback(
    async (name: string, root: string) => {
      await addNotesFolderToRegistry(name, root);
      await openNotesFolder({ name: name.trim(), root });
    },
    [openNotesFolder, addNotesFolderToRegistry]
  );

  const removeNotesFolder = useCallback(async (name: string) => {
    const notesFolders = await window.memoryStack.removeNotesFolder(name);
    setState((s) => ({
      ...s,
      notesFolders,
      ...(s.activeNotesFolder?.name.toLowerCase() === name.toLowerCase()
        ? {
            activeNotesFolder: null,
            notes: [],
            graph: EMPTY_GRAPH,
            propertySchemas: {},
            reconciling: false,
          }
        : {}),
    }));
  }, []);

  const renameNotesFolder = useCallback(async (oldName: string, newName: string) => {
    const notesFolders = await window.memoryStack.renameNotesFolder(oldName, newName); // throws on empty/duplicate name
    setState((s) => ({
      ...s,
      notesFolders,
      activeNotesFolder:
        s.activeNotesFolder?.name.toLowerCase() === oldName.toLowerCase()
          ? { ...s.activeNotesFolder, name: newName.trim() }
          : s.activeNotesFolder,
    }));
  }, []);

  const closeNotesFolder = useCallback(() => {
    activeRootRef.current = null;
    setState((s) => ({
      ...s,
      activeNotesFolder: null,
      notes: [],
      graph: EMPTY_GRAPH,
      propertySchemas: {},
      reconciling: false,
    }));
  }, []);

  // Reloads the currently open notes folder from disk (e.g. after a note is
  // created/renamed/deleted/saved, or on a debounced external file change).
  // Backed by the same mtime-aware loadNotesFolder as the cache
  // reconciliation pass, so only files that actually changed get
  // re-parsed. Pass `showReindexing: true` to surface the same "Reindexing
  // vault…" toast the background reconciliation pass uses — worth it for a
  // rename, which can touch many files at once (every note whose incoming
  // links got rewritten), but not for routine autosaves.
  const refresh = useCallback(
    async (options?: { showReindexing?: boolean }) => {
      if (!state.activeNotesFolder) return;
      const showReindexing = options?.showReindexing ?? false;
      if (showReindexing) setState((s) => ({ ...s, reconciling: true }));
      try {
        const { notes } = await window.memoryStack.reloadNotesFolder();
        setState((s) => ({
          ...s,
          notes,
          graph: buildGraph(notes),
          ...(showReindexing ? { reconciling: false } : {}),
        }));
      } catch (err) {
        setState((s) => ({ ...s, error: String(err), ...(showReindexing ? { reconciling: false } : {}) }));
      }
    },
    [state.activeNotesFolder]
  );

  const saveSchema = useCallback(async (root: string, properties: PropertyDef[]) => {
    const updated = await window.memoryStack.savePropertySchema(root, properties);
    setState((s) => ({ ...s, propertySchemas: { ...s.propertySchemas, [root]: updated } }));
  }, []);

  // Property edits (e.g. a "tags" property) can affect Note.tags/the graph,
  // so refresh the whole session after saving — same pattern used elsewhere
  // (create/delete/rename) to keep notes/graph in sync post-mutation.
  const saveNoteProperties = useCallback(
    async (absPath: string, properties: Record<string, unknown>) => {
      await window.memoryStack.saveNoteProperties(absPath, properties);
      await refresh();
    },
    [refresh]
  );

  // Debounced full reload on any external file change (add/change/unlink).
  useEffect(() => {
    if (!state.activeNotesFolder) return;
    const unsubscribe = window.memoryStack.onFileChanged(() => {
      if (reloadTimer.current) clearTimeout(reloadTimer.current);
      reloadTimer.current = setTimeout(() => {
        refresh();
      }, 200);
    });
    return () => {
      unsubscribe();
      if (reloadTimer.current) clearTimeout(reloadTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.activeNotesFolder]);

  return {
    ...state,
    openNotesFolderByEntry,
    addNotesFolder,
    addNotesFolderToRegistry,
    removeNotesFolder,
    renameNotesFolder,
    closeNotesFolder,
    refresh,
    saveSchema,
    saveNoteProperties,
  };
}
