import { useCallback, useEffect, useRef, useState } from "react";
import type { CairnEntry, GraphModel, Note, PropertyDef, StackEntry } from "@shared/types";
import { buildGraph } from "@shared/buildGraph";
import { loadThirdPartyPlugins } from "../plugins/loader";

export type ActiveSession =
  | { kind: "stack"; entry: StackEntry }
  | { kind: "cairn"; entry: CairnEntry; memberStacks: StackEntry[] };

export interface StackState {
  stacks: StackEntry[];
  cairns: CairnEntry[];
  activeSession: ActiveSession | null;
  notes: Note[];
  graph: GraphModel;
  /** Property schema for every currently-open root (the one stack's root in
   *  a plain session, or every member stack's root in an open Cairn), keyed
   *  by absolute root path. */
  propertySchemas: Record<string, PropertyDef[]>;
  loading: boolean;
  error: string | null;
  /** True while any active root's background reconciliation pass (kicked
   *  off by openStack/openCairn) is still in progress. */
  reconciling: boolean;
}

const EMPTY_GRAPH: GraphModel = { nodes: [], edges: [] };

function belongsToRoot(note: Note, root: string): boolean {
  return note.path === root || note.path.startsWith(`${root}/`) || note.path.startsWith(`${root}\\`);
}

export function useStack() {
  const [state, setState] = useState<StackState>({
    stacks: [],
    cairns: [],
    activeSession: null,
    notes: [],
    graph: EMPTY_GRAPH,
    propertySchemas: {},
    loading: false,
    error: null,
    reconciling: false,
  });
  const reloadTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Mirrors which roots are currently open outside React state so the
  // reconciliation listeners (registered once, empty dep array) always see
  // the latest set without needing state in their dependency array.
  const activeRootsRef = useRef<string[]>([]);
  const pendingReconcileRootsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    window.memoryStack.listStacks().then((stacks) => setState((s) => ({ ...s, stacks })));
    window.memoryStack.listCairns().then((cairns) => setState((s) => ({ ...s, cairns })));
  }, []);

  // Opens/switches to a single stack. The main process serves this from a
  // persisted per-vault cache when one exists (near-instant, whole vault at
  // once), only falling back to a full synchronous parse on that vault's
  // very first open. A background reconciliation pass then catches up any
  // changes made to the vault outside the app (see the onReconciled
  // listener below).
  const openStack = useCallback(async (entry: StackEntry) => {
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const [index, propertySchema] = await Promise.all([
        window.memoryStack.loadStack(entry.root),
        window.memoryStack.readPropertySchema(entry.root),
      ]);
      activeRootsRef.current = [entry.root];
      pendingReconcileRootsRef.current = new Set(activeRootsRef.current);
      setState((s) => ({
        ...s,
        activeSession: { kind: "stack", entry },
        notes: index.notes,
        graph: buildGraph(index.notes),
        propertySchemas: { [entry.root]: propertySchema },
        loading: false,
        error: null,
        // stack:load always kicks off a background reconciliation pass right
        // after it resolves (see main.ts) — reflect that here rather than
        // waiting on a separate IPC "started" event, which could otherwise
        // race this state update (arriving before activeSession is set below).
        reconciling: true,
      }));
      await loadThirdPartyPlugins();
    } catch (err) {
      setState((s) => ({ ...s, loading: false, error: String(err) }));
    }
  }, []);

  // Opens a Cairn — every member stack loads together (same cache/watch
  // machinery as a plain stack, one session per member root in the main
  // process) and their notes merge into one note list/graph, each note
  // stamped with which stack it came from (Note.sourceStack).
  const openCairn = useCallback(async (entry: CairnEntry, memberStacks: StackEntry[]) => {
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const loadEntries = memberStacks.map((m) => ({ root: m.root, name: m.name }));
      const [index, schemas] = await Promise.all([
        window.memoryStack.loadCairn(loadEntries),
        Promise.all(memberStacks.map((m) => window.memoryStack.readPropertySchema(m.root))),
      ]);
      activeRootsRef.current = index.roots;
      pendingReconcileRootsRef.current = new Set(activeRootsRef.current);
      const propertySchemas: Record<string, PropertyDef[]> = {};
      memberStacks.forEach((m, i) => {
        propertySchemas[m.root] = schemas[i];
      });
      setState((s) => ({
        ...s,
        activeSession: { kind: "cairn", entry, memberStacks },
        notes: index.notes,
        graph: buildGraph(index.notes),
        propertySchemas,
        loading: false,
        error: null,
        reconciling: true,
      }));
      await loadThirdPartyPlugins();
    } catch (err) {
      setState((s) => ({ ...s, loading: false, error: String(err) }));
    }
  }, []);

  // The background reconciliation pass (kicked off by openStack/openCairn)
  // found one root's on-disk contents differ from the cache it served
  // initially — replace just that root's slice of notes and rebuild the
  // merged graph.
  useEffect(() => {
    const unsubscribe = window.memoryStack.onReconciled(({ root: eventRoot, notes: rootNotes }) => {
      if (!activeRootsRef.current.includes(eventRoot)) return; // stale event for a root we've since left
      setState((s) => {
        const merged = [...s.notes.filter((n) => !belongsToRoot(n, eventRoot)), ...rootNotes];
        return { ...s, notes: merged, graph: buildGraph(merged) };
      });
    });
    return unsubscribe;
  }, []);

  // One root's background reconciliation pass has finished, whether or not
  // it found anything to change. `reconciling` stays true until every
  // active root's pass has finished (relevant for a Cairn's several roots).
  useEffect(() => {
    const unsubscribe = window.memoryStack.onReconcileStatus(({ root: eventRoot, reconciling }) => {
      if (!activeRootsRef.current.includes(eventRoot)) return;
      if (reconciling) pendingReconcileRootsRef.current.add(eventRoot);
      else pendingReconcileRootsRef.current.delete(eventRoot);
      setState((s) => ({ ...s, reconciling: pendingReconcileRootsRef.current.size > 0 }));
    });
    return unsubscribe;
  }, []);

  const openStackByEntry = useCallback((entry: StackEntry) => openStack(entry), [openStack]);

  const openCairnByEntry = useCallback(
    (entry: CairnEntry) => {
      const memberStacks = entry.memberStackNames
        .map((name) => state.stacks.find((s) => s.name.toLowerCase() === name.toLowerCase()))
        .filter((s): s is StackEntry => s !== undefined);
      return openCairn(entry, memberStacks);
    },
    [openCairn, state.stacks]
  );

  const addStack = useCallback(
    async (name: string, root: string) => {
      const stacks = await window.memoryStack.addStack(name, root); // throws on empty/duplicate name
      setState((s) => ({ ...s, stacks }));
      await openStack({ name: name.trim(), root });
    },
    [openStack]
  );

  const removeStack = useCallback(async (name: string) => {
    const stacks = await window.memoryStack.removeStack(name);
    setState((s) => ({
      ...s,
      stacks,
      ...(s.activeSession?.kind === "stack" && s.activeSession.entry.name.toLowerCase() === name.toLowerCase()
        ? {
            activeSession: null,
            notes: [],
            graph: EMPTY_GRAPH,
            propertySchemas: {},
            reconciling: false,
          }
        : {}),
    }));
  }, []);

  const renameStack = useCallback(async (oldName: string, newName: string) => {
    const stacks = await window.memoryStack.renameStack(oldName, newName); // throws on empty/duplicate name
    setState((s) => ({
      ...s,
      stacks,
      activeSession:
        s.activeSession?.kind === "stack" && s.activeSession.entry.name.toLowerCase() === oldName.toLowerCase()
          ? { kind: "stack", entry: { ...s.activeSession.entry, name: newName.trim() } }
          : s.activeSession,
    }));
  }, []);

  const addCairn = useCallback(async (name: string, memberStackNames: string[]) => {
    const cairns = await window.memoryStack.addCairn(name, memberStackNames); // throws on empty/duplicate name or <2 members
    setState((s) => ({ ...s, cairns }));
  }, []);

  const removeCairn = useCallback(async (name: string) => {
    const cairns = await window.memoryStack.removeCairn(name);
    setState((s) => ({
      ...s,
      cairns,
      ...(s.activeSession?.kind === "cairn" && s.activeSession.entry.name.toLowerCase() === name.toLowerCase()
        ? {
            activeSession: null,
            notes: [],
            graph: EMPTY_GRAPH,
            propertySchemas: {},
            reconciling: false,
          }
        : {}),
    }));
  }, []);

  const renameCairn = useCallback(async (oldName: string, newName: string) => {
    const cairns = await window.memoryStack.renameCairn(oldName, newName); // throws on empty/duplicate name
    setState((s) => ({
      ...s,
      cairns,
      activeSession:
        s.activeSession?.kind === "cairn" && s.activeSession.entry.name.toLowerCase() === oldName.toLowerCase()
          ? { ...s.activeSession, entry: { ...s.activeSession.entry, name: newName.trim() } }
          : s.activeSession,
    }));
  }, []);

  const updateCairnMembers = useCallback(async (name: string, memberStackNames: string[]) => {
    const cairns = await window.memoryStack.updateCairnMembers(name, memberStackNames); // throws on <2 members
    setState((s) => ({ ...s, cairns }));
  }, []);

  const closeStack = useCallback(() => {
    activeRootsRef.current = [];
    pendingReconcileRootsRef.current = new Set();
    setState((s) => ({
      ...s,
      activeSession: null,
      notes: [],
      graph: EMPTY_GRAPH,
      propertySchemas: {},
      reconciling: false,
    }));
  }, []);

  // Reloads the currently open session from disk (e.g. after a note is
  // created/renamed/deleted/saved, or on a debounced external file change).
  // Backed by the same mtime-aware loadStack as the cache reconciliation
  // pass, so only files that actually changed get re-parsed. Pass
  // `showReindexing: true` to surface the same "Reindexing vault…" toast the
  // background reconciliation pass uses — worth it for a rename, which can
  // touch many files at once (every note whose incoming links got
  // rewritten), but not for routine autosaves.
  const refresh = useCallback(
    async (options?: { showReindexing?: boolean }) => {
      if (!state.activeSession) return;
      const showReindexing = options?.showReindexing ?? false;
      if (showReindexing) setState((s) => ({ ...s, reconciling: true }));
      try {
        const { notes } =
          state.activeSession.kind === "cairn"
            ? await window.memoryStack.reloadCairn()
            : await window.memoryStack.reloadStack();
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
    [state.activeSession]
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
    if (!state.activeSession) return;
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
  }, [state.activeSession]);

  return {
    ...state,
    openStackByEntry,
    openCairnByEntry,
    addStack,
    removeStack,
    renameStack,
    addCairn,
    removeCairn,
    renameCairn,
    updateCairnMembers,
    closeStack,
    refresh,
    saveSchema,
    saveNoteProperties,
  };
}
