import { createRepo, getUser, listRepos } from "./githubApi";
import { deleteToken, pollForToken, readToken, startDeviceFlow, writeToken, type DeviceFlowStart, type TokenCrypto } from "./githubAuth";
import { ensureRepo, listChanges, syncFolder } from "./gitSync";
import { readSyncConfigFile, removeSyncLink, setSyncLink, writeSyncConfigFile } from "./syncConfig";
import type { GithubRepo, GithubStatus, SyncChange, SyncLink, SyncResult } from "../shared/types";

// The host-side half of the GitHub sync plugin. An iframe plugin can't use
// Node, safeStorage or isomorphic-git, so it calls these by name through
// plugin:invoke. Everything is gated on the plugin being enabled AND holding
// the "git-sync" permission, acts only on the *active notes folder* (the
// plugin never supplies a filesystem path), and never hands the OAuth token
// back - the plugin only ever sees { connected, login }.

export interface FolderRef {
  name: string;
  root: string;
}

export interface CapabilityEnv {
  clientId: string;
  tokenFile: string;
  syncConfigFile: string;
  crypto: TokenCrypto;
  isPluginEnabled(pluginId: string): boolean;
  hasGitSyncPermission(pluginId: string): boolean;
  activeFolder(): FolderRef | null;
  registeredFolders(): FolderRef[];
  /** Opens a URL in the user's browser. Only ever called with GitHub's device-flow page. */
  openExternal(url: string): Promise<void>;
  // Seams so tests can run the gate and validation without network or git.
  deps?: Partial<{
    listChanges: (root: string) => Promise<SyncChange[]>;
    ensureRepo: typeof ensureRepo;
    syncFolder: typeof syncFolder;
    getUser: typeof getUser;
    listRepos: typeof listRepos;
    createRepo: typeof createRepo;
  }>;
}

const REPO_RE = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const REPO_NAME_RE = /^[A-Za-z0-9_.-]+$/;
const BRANCH_RE = /^[A-Za-z0-9_./-]+$/;

export function createGitSyncCapability(env: CapabilityEnv) {
  const d = {
    listChanges: env.deps?.listChanges ?? listChanges,
    ensureRepo: env.deps?.ensureRepo ?? ensureRepo,
    syncFolder: env.deps?.syncFolder ?? syncFolder,
    getUser: env.deps?.getUser ?? getUser,
    listRepos: env.deps?.listRepos ?? listRepos,
    createRepo: env.deps?.createRepo ?? createRepo,
  };
  let pendingAuth: { start: DeviceFlowStart; signal: { aborted: boolean } } | null = null;
  const syncing = new Set<string>();

  const token = (): string => {
    const t = readToken(env.tokenFile, env.crypto);
    if (!t) throw new Error("Not connected to GitHub. Connect GitHub first.");
    return t;
  };

  const requireFolder = (): FolderRef => {
    const f = env.activeFolder();
    if (!f) throw new Error("Open a notes folder first.");
    return f;
  };

  const linkFor = (folderName: string): SyncLink | null =>
    Object.entries(readSyncConfigFile(env.syncConfigFile)).find(([n]) => n.toLowerCase() === folderName.toLowerCase())?.[1] ?? null;

  const requireLink = (folder: FolderRef): SyncLink => {
    const link = linkFor(folder.name);
    if (!link) throw new Error("This notes folder isn't connected to a GitHub repository.");
    return link;
  };

  const authStatus = async (): Promise<GithubStatus> => {
    const t = readToken(env.tokenFile, env.crypto);
    if (!t) return { connected: false, login: null };
    try {
      return { connected: true, login: (await d.getUser(t)).login };
    } catch {
      return { connected: true, login: null }; // offline or revoked; the next real call surfaces it
    }
  };

  async function runSync(
    folder: FolderRef,
    opts: { pullOnly: boolean; paths?: string[]; message?: string }
  ): Promise<SyncResult> {
    const link = requireLink(folder);
    if (syncing.has(folder.root)) throw new Error("A sync is already running for this folder.");
    syncing.add(folder.root);
    try {
      const t = token();
      const { login } = await d.getUser(t);
      const result = await d.syncFolder({
        root: folder.root,
        repoFullName: link.repoFullName,
        branch: link.branch,
        token: t,
        author: { name: login, email: `${login}@users.noreply.github.com` },
        ...opts,
      });
      writeSyncConfigFile(
        env.syncConfigFile,
        setSyncLink(readSyncConfigFile(env.syncConfigFile), folder.name, {
          ...link,
          lastSyncAt: Date.now(),
          lastStatus: result.status,
          lastMessage: result.message,
        })
      );
      return result;
    } finally {
      syncing.delete(folder.root);
    }
  }

  const handlers: Record<string, (...args: unknown[]) => Promise<unknown>> = {
    "auth.status": authStatus,

    "auth.start": async () => {
      if (pendingAuth) pendingAuth.signal.aborted = true;
      const start = await startDeviceFlow(env.clientId);
      pendingAuth = { start, signal: { aborted: false } };
      await env.openExternal(start.verificationUri);
      return { userCode: start.userCode, verificationUri: start.verificationUri };
    },

    // Long-running: resolves once the user has authorised in the browser.
    "auth.await": async () => {
      const flow = pendingAuth;
      if (!flow) throw new Error("Sign-in was not started.");
      try {
        const t = await pollForToken(env.clientId, flow.start, { signal: flow.signal });
        writeToken(env.tokenFile, t, env.crypto);
        return await authStatus();
      } finally {
        if (pendingAuth === flow) pendingAuth = null;
      }
    },

    "auth.cancel": async () => {
      if (pendingAuth) pendingAuth.signal.aborted = true;
      return true;
    },

    "auth.disconnect": async () => {
      deleteToken(env.tokenFile);
      return { connected: false, login: null } satisfies GithubStatus;
    },

    "repo.list": async (): Promise<GithubRepo[]> => d.listRepos(token()),

    "repo.create": async (name: unknown, isPrivate: unknown): Promise<GithubRepo> => {
      if (typeof name !== "string" || !REPO_NAME_RE.test(name)) {
        throw new Error("Repository names may only contain letters, numbers, '.', '-' and '_'.");
      }
      return d.createRepo(token(), name, isPrivate !== false);
    },

    "folder.get": async () => {
      const folder = env.activeFolder();
      return folder ? { name: folder.name, link: linkFor(folder.name) } : null;
    },

    "link.set": async (repoFullName: unknown, branch: unknown) => {
      const folder = requireFolder();
      if (typeof repoFullName !== "string" || !REPO_RE.test(repoFullName)) throw new Error("Invalid repository.");
      if (typeof branch !== "string" || !BRANCH_RE.test(branch)) throw new Error("Invalid branch.");
      const link: SyncLink = { repoFullName, branch };
      writeSyncConfigFile(env.syncConfigFile, setSyncLink(readSyncConfigFile(env.syncConfigFile), folder.name, link));
      return link;
    },

    "link.remove": async () => {
      const folder = requireFolder();
      writeSyncConfigFile(env.syncConfigFile, removeSyncLink(readSyncConfigFile(env.syncConfigFile), folder.name));
      return true;
    },

    "sync.status": async () => {
      const folder = requireFolder();
      const link = linkFor(folder.name);
      if (!link) return { folder: folder.name, link: null, changes: [] as SyncChange[] };
      await d.ensureRepo(folder.root, link.branch, `https://github.com/${link.repoFullName}.git`);
      return { folder: folder.name, link, changes: await d.listChanges(folder.root) };
    },

    "sync.pull": async () => runSync(requireFolder(), { pullOnly: true }),

    "sync.commitPush": async (paths: unknown, message: unknown) => {
      const folder = requireFolder();
      requireLink(folder);
      if (!Array.isArray(paths) || paths.some((p) => typeof p !== "string")) throw new Error("Invalid file selection.");
      if (message !== undefined && typeof message !== "string") throw new Error("Invalid commit message.");
      // Only files that genuinely have changes may be named; this also rules out "../" paths.
      const known = new Set((await d.listChanges(folder.root)).map((c) => c.path));
      const selected = [...new Set(paths as string[])];
      const unknown = selected.filter((p) => !known.has(p));
      if (unknown.length) throw new Error(`Not a changed file: ${unknown[0]}`);
      return runSync(folder, { pullOnly: false, paths: selected, message });
    },

    // Pull-only across every linked notes folder; one failing doesn't stop the rest.
    "sync.fetchAll": async () => {
      const config = readSyncConfigFile(env.syncConfigFile);
      const out: { name: string; result: SyncResult }[] = [];
      for (const folder of env.registeredFolders()) {
        if (!Object.keys(config).some((n) => n.toLowerCase() === folder.name.toLowerCase())) continue;
        try {
          out.push({ name: folder.name, result: await runSync(folder, { pullOnly: true }) });
        } catch (err) {
          out.push({
            name: folder.name,
            result: {
              status: "error",
              message: err instanceof Error ? err.message : String(err),
              committed: false,
              pushed: false,
              pulled: false,
            },
          });
        }
      }
      return out;
    },
  };

  return {
    methods: Object.keys(handlers),
    async dispatch(pluginId: string, method: string, args: unknown[] = []): Promise<unknown> {
      if (!env.isPluginEnabled(pluginId)) throw new Error("This plugin is disabled.");
      if (!env.hasGitSyncPermission(pluginId)) throw new Error('This plugin has not been granted the "git-sync" permission.');
      // Own-property lookup so "constructor" / "__proto__" can't resolve to anything.
      if (!Object.prototype.hasOwnProperty.call(handlers, method)) throw new Error(`Unknown method "${method}"`);
      return handlers[method](...args);
    },
  };
}
