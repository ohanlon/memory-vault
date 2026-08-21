import { useCallback, useEffect, useRef, useState } from "react";
import type { GraphModel, Note, VaultEntry } from "@shared/types";
import { buildGraph } from "@shared/buildGraph";

export interface VaultState {
  vaults: VaultEntry[];
  activeName: string | null;
  root: string | null;
  notes: Note[];
  graph: GraphModel;
  loading: boolean;
  error: string | null;
}

export function useVault() {
  const [state, setState] = useState<VaultState>({
    vaults: [],
    activeName: null,
    root: null,
    notes: [],
    graph: { nodes: [], edges: [] },
    loading: false,
    error: null,
  });
  const reloadTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    window.memoryVault.listVaults().then((vaults) => {
      setState((s) => ({ ...s, vaults }));
    });
  }, []);

  const openVault = useCallback(async (root: string, name: string | null = null) => {
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const index = await window.memoryVault.loadVault(root);
      setState((s) => ({
        ...s,
        root: index.root,
        activeName: name,
        notes: index.notes,
        graph: buildGraph(index.notes),
        loading: false,
        error: null,
      }));
    } catch (err) {
      setState((s) => ({ ...s, loading: false, error: String(err) }));
    }
  }, []);

  const openVaultByEntry = useCallback(
    (entry: VaultEntry) => openVault(entry.root, entry.name),
    [openVault]
  );

  const addVault = useCallback(
    async (name: string, root: string) => {
      const vaults = await window.memoryVault.addVault(name, root); // throws on empty/duplicate name
      setState((s) => ({ ...s, vaults }));
      await openVault(root, name.trim());
    },
    [openVault]
  );

  const removeVault = useCallback(
    async (name: string) => {
      const vaults = await window.memoryVault.removeVault(name);
      setState((s) => ({
        ...s,
        vaults,
        ...(s.activeName?.toLowerCase() === name.toLowerCase()
          ? { root: null, activeName: null, notes: [], graph: { nodes: [], edges: [] } }
          : {}),
      }));
    },
    []
  );

  const closeVault = useCallback(() => {
    setState((s) => ({ ...s, root: null, activeName: null, notes: [], graph: { nodes: [], edges: [] } }));
  }, []);

  // Re-reads the currently open vault from disk (e.g. after a note is
  // created/renamed/deleted/saved).
  const refresh = useCallback(() => {
    if (state.root) return openVault(state.root, state.activeName);
  }, [state.root, state.activeName, openVault]);

  // Debounced full reload on any external file change (add/change/unlink).
  useEffect(() => {
    if (!state.root) return;
    const root = state.root;
    const name = state.activeName;
    const unsubscribe = window.memoryVault.onFileChanged(() => {
      if (reloadTimer.current) clearTimeout(reloadTimer.current);
      reloadTimer.current = setTimeout(() => {
        openVault(root, name);
      }, 200);
    });
    return () => {
      unsubscribe();
      if (reloadTimer.current) clearTimeout(reloadTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.root]);

  return { ...state, openVaultByEntry, addVault, removeVault, closeVault, refresh };
}
