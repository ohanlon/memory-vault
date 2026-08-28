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
}

export function useStack() {
  const [state, setState] = useState<StackState>({
    stacks: [],
    activeName: null,
    root: null,
    notes: [],
    folders: [],
    graph: { nodes: [], edges: [] },
    propertySchema: [],
    loading: false,
    error: null,
  });
  const reloadTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    window.memoryStack.listStacks().then((stacks) => {
      setState((s) => ({ ...s, stacks }));
    });
  }, []);

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
      }));
      await loadThirdPartyPlugins();
    } catch (err) {
      setState((s) => ({ ...s, loading: false, error: String(err) }));
    }
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
              graph: { nodes: [], edges: [] },
              propertySchema: [],
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
      graph: { nodes: [], edges: [] },
      propertySchema: [],
    }));
  }, []);

  // Re-reads the currently open stack from disk (e.g. after a note is
  // created/renamed/deleted/saved).
  const refresh = useCallback(() => {
    if (state.root) return openStack(state.root, state.activeName);
  }, [state.root, state.activeName, openStack]);

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
    const root = state.root;
    const name = state.activeName;
    const unsubscribe = window.memoryStack.onFileChanged(() => {
      if (reloadTimer.current) clearTimeout(reloadTimer.current);
      reloadTimer.current = setTimeout(() => {
        openStack(root, name);
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
