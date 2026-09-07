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
  /** True while the background reconciliation pass kicked off by openStack
   *  is in progress (see the onReconcileStatus listener below). */
  reconciling: boolean;
}

const EMPTY_GRAPH: GraphModel = { nodes: [], edges: [] };

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
    reconciling: false,
  });
  const reloadTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    window.memoryStack.listStacks().then((stacks) => {
      setState((s) => ({ ...s, stacks }));
    });
  }, []);

  // Opens/switches to a stack. The main process serves this from a persisted
  // per-vault cache when one exists (near-instant, whole vault at once), only
  // falling back to a full synchronous parse on that vault's very first open.
  // A background reconciliation pass then catches up any changes made to the
  // vault outside the app (see the onReconciled listener below).
  const openStack = useCallback(async (root: string, name: string | null = null) => {
    setState((s) => ({ ...s, loading: true, error: null }));
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
        // stack:load always kicks off a background reconciliation pass right
        // after it resolves (see main.ts) — reflect that here rather than
        // waiting on a separate IPC "started" event, which could otherwise
        // race this state update (arriving before root is set below).
        reconciling: true,
      }));
      await loadThirdPartyPlugins();
    } catch (err) {
      setState((s) => ({ ...s, loading: false, error: String(err) }));
    }
  }, []);

  // The background reconciliation pass (kicked off by openStack) found the
  // on-disk vault differs from the cache it served initially — replace
  // notes/folders and rebuild the graph with the reconciled result.
  useEffect(() => {
    const unsubscribe = window.memoryStack.onReconciled(({ root: eventRoot, notes, folders }) => {
      setState((s) => {
        if (s.root !== eventRoot) return s; // stale event for a stack we've since left
        return { ...s, notes, folders, graph: buildGraph(notes) };
      });
    });
    return unsubscribe;
  }, []);

  // The background reconciliation pass (started when openStack's state
  // update set reconciling: true above) has finished, whether or not it
  // found anything to change.
  useEffect(() => {
    const unsubscribe = window.memoryStack.onReconcileStatus(({ root: eventRoot, reconciling }) => {
      setState((s) => {
        if (s.root !== eventRoot) return s; // stale event for a stack we've since left
        return { ...s, reconciling };
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
              reconciling: false,
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
      reconciling: false,
    }));
  }, []);

  // Reloads the currently open stack from disk (e.g. after a note is
  // created/renamed/deleted/saved, or on a debounced external file change).
  // Backed by the same mtime-aware loadStack as the cache reconciliation
  // pass, so only files that actually changed get re-parsed.
  const refresh = useCallback(async () => {
    if (!state.root) return;
    try {
      const { notes, folders } = await window.memoryStack.reloadStack();
      setState((s) => ({ ...s, notes, folders, graph: buildGraph(notes) }));
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
  };
}
