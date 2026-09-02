import { useCallback, useEffect, useRef, useState } from "react";
import type { FolderEntry, GraphModel, Note, PropertyDef, StackEntry } from "@shared/types";
import { buildGraph } from "@shared/buildGraph";
import { loadThirdPartyPlugins } from "../plugins/loader";

export interface StackState {
  stacks: StackEntry[];
  activeName: string | null;
  root: string | null;
  notes: Note[];
  folders: FolderEntry[];
  graph: GraphModel;
  propertySchema: PropertyDef[];
  loading: boolean;
  error: string | null;
  /**
   * True once the whole vault is known (either the background full scan
   * landed, or a refresh() ran a full reload). Before that, notes/folders
   * only cover the root level plus whichever folders have been expanded.
   */
  fullyLoaded: boolean;
}

const EMPTY_GRAPH: GraphModel = { nodes: [], edges: [] };

function mergeByPath<T extends { path: string }>(existing: T[], incoming: T[]): T[] {
  if (incoming.length === 0) return existing;
  const map = new Map(existing.map((e) => [e.path, e]));
  for (const item of incoming) map.set(item.path, item);
  return Array.from(map.values());
}

export function useStack() {
  const [state, setState] = useState<StackState>({
    stacks: [],
    activeName: null,
    root: null,
    notes: [],
    folders: [],
    graph: EMPTY_GRAPH,
    propertySchema: [],
    loading: false,
    error: null,
    fullyLoaded: false,
  });
  const reloadTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Relative paths of folders whose immediate children are already known, so
  // loadFolderChildren can skip a redundant IPC round trip on repeat expands.
  const loadedFoldersRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    window.memoryStack.listStacks().then((stacks) => {
      setState((s) => ({ ...s, stacks }));
    });
  }, []);

  // Opens/switches to a stack. Only the root level loads up front (fast,
  // even for a huge vault) — deeper folders load lazily as the file tree
  // expands them (loadFolderChildren) — while a full background scan (see
  // the onFullScan listener below) catches graph/search/backlinks up shortly after.
  const openStack = useCallback(async (root: string, name: string | null = null) => {
    setState((s) => ({ ...s, loading: true, error: null }));
    loadedFoldersRef.current = new Set([""]);
    try {
      const [index, propertySchema] = await Promise.all([
        window.memoryStack.loadStack(root),
        window.memoryStack.readPropertySchema(),
      ]);
      setState((s) => ({
        ...s,
        root: index.root,
        activeName: name,
        notes: index.notes,
        folders: index.folders,
        graph: buildGraph(index.notes),
        propertySchema,
        loading: false,
        error: null,
        fullyLoaded: false,
      }));
      await loadThirdPartyPlugins();
    } catch (err) {
      setState((s) => ({ ...s, loading: false, error: String(err) }));
    }
  }, []);

  // Fetches one folder's immediate children and merges them in — a no-op if
  // that folder's children are already known (or the vault is already fully
  // loaded). Called when the file tree expands a folder.
  const loadFolderChildren = useCallback(async (folder: FolderEntry) => {
    if (loadedFoldersRef.current.has(folder.relativePath)) return;
    loadedFoldersRef.current.add(folder.relativePath);
    try {
      const { notes: newNotes, folders: newFolders } = await window.memoryStack.listFolderChildren(folder.path);
      setState((s) => {
        if (s.fullyLoaded) return s; // the full scan already covers this folder
        const notes = mergeByPath(s.notes, newNotes);
        const folders = mergeByPath(s.folders, newFolders);
        return { ...s, notes, folders, graph: buildGraph(notes) };
      });
    } catch {
      loadedFoldersRef.current.delete(folder.relativePath); // allow a retry on the next expand
    }
  }, []);

  // Once the whole vault is known, per-folder fetching is no longer needed.
  useEffect(() => {
    const unsubscribe = window.memoryStack.onFullScan(({ root: scanRoot, notes, folders }) => {
      setState((s) => {
        if (s.root !== scanRoot) return s; // stale event for a stack we've since left
        return { ...s, notes, folders, graph: buildGraph(notes), fullyLoaded: true };
      });
    });
    return unsubscribe;
  }, []);

  const openStackByEntry = useCallback(
    (entry: StackEntry) => openStack(entry.root, entry.name),
    [openStack]
  );

  const addStack = useCallback(
    async (name: string, root: string) => {
      const stacks = await window.memoryStack.addStack(name, root); // throws on empty/duplicate name
      setState((s) => ({ ...s, stacks }));
      await openStack(root, name.trim());
    },
    [openStack]
  );

  const removeStack = useCallback(
    async (name: string) => {
      const stacks = await window.memoryStack.removeStack(name);
      setState((s) => ({
        ...s,
        stacks,
        ...(s.activeName?.toLowerCase() === name.toLowerCase()
          ? {
              root: null,
              activeName: null,
              notes: [],
              folders: [],
              graph: EMPTY_GRAPH,
              propertySchema: [],
              fullyLoaded: false,
            }
          : {}),
      }));
    },
    []
  );

  const renameStack = useCallback(
    async (oldName: string, newName: string) => {
      const stacks = await window.memoryStack.renameStack(oldName, newName); // throws on empty/duplicate name
      setState((s) => ({
        ...s,
        stacks,
        activeName: s.activeName?.toLowerCase() === oldName.toLowerCase() ? newName.trim() : s.activeName,
      }));
    },
    []
  );

  const closeStack = useCallback(() => {
    setState((s) => ({
      ...s,
      root: null,
      activeName: null,
      notes: [],
      folders: [],
      graph: EMPTY_GRAPH,
      propertySchema: [],
      fullyLoaded: false,
    }));
  }, []);

  // Fully reloads the currently open stack from disk (e.g. after a note is
  // created/renamed/deleted/saved). Unlike openStack, this always walks the
  // whole vault — cheap enough since it only runs on explicit mutations or a
  // debounced external file change, not on every keystroke — which also
  // resolves any folders the lazy per-folder loading hadn't reached yet.
  const refresh = useCallback(async () => {
    if (!state.root) return;
    try {
      const { notes, folders } = await window.memoryStack.reloadStack();
      setState((s) => ({ ...s, notes, folders, graph: buildGraph(notes), fullyLoaded: true }));
    } catch (err) {
      setState((s) => ({ ...s, error: String(err) }));
    }
  }, [state.root]);

  const saveSchema = useCallback(async (properties: PropertyDef[]) => {
    const updated = await window.memoryStack.savePropertySchema(properties);
    setState((s) => ({ ...s, propertySchema: updated }));
  }, []);

  // Property edits (e.g. a "tags" property) can affect Note.tags/the graph,
  // so refresh the whole stack after saving — same pattern used elsewhere
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
    if (!state.root) return;
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
  }, [state.root]);

  return {
    ...state,
    openStackByEntry,
    addStack,
    removeStack,
    renameStack,
    closeStack,
    refresh,
    saveSchema,
    saveNoteProperties,
    loadFolderChildren,
  };
}
