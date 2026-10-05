import fs from "node:fs";
import path from "node:path";
import git from "isomorphic-git";
import http from "isomorphic-git/http/node";
import type { SyncChange, SyncResult } from "../shared/types";

export type SyncRelation = "no-remote" | "no-local" | "same" | "ahead" | "behind" | "diverged";

export type SyncPlan =
  | { kind: "conflict"; message: string }
  | { kind: "fast-forward" }
  | { kind: "adopt-remote-then-commit-push" }
  | { kind: "commit-push"; commit: boolean; push: boolean };

// Pure decision logic, kept apart from the isomorphic-git calls so every
// branch can be tested without a network. Never overwrites either side:
// anything that would need a merge is reported as a conflict instead.
// "behind" always fast-forwards, even with local edits: the checkout itself
// refuses (and syncFolder rolls back) if a file GitHub changed is also
// edited locally, so unrelated local changes don't block a pull.
export function planSync(relation: SyncRelation, dirty: boolean): SyncPlan {
  switch (relation) {
    case "diverged":
      return {
        kind: "conflict",
        message: "This folder and the GitHub repo have different histories. Nothing was changed; resolve it manually.",
      };
    case "behind":
      return { kind: "fast-forward" };
    case "no-local":
      return { kind: "adopt-remote-then-commit-push" };
    case "no-remote":
      return { kind: "commit-push", commit: dirty, push: true };
    case "ahead":
      return { kind: "commit-push", commit: dirty, push: true };
    case "same":
      return { kind: "commit-push", commit: dirty, push: dirty };
  }
}

// .cairn/ holds Cairn's own local caches and workspace state - never notes.
const IGNORE_DEFAULT = ".DS_Store\nThumbs.db\n.cairn/\n";

function isInternalPath(p: string): boolean {
  return p === ".cairn" || p.startsWith(".cairn/") || p === ".git" || p.startsWith(".git/");
}

/** Initialises the repo and points `origin` at GitHub if that hasn't happened yet. */
export async function ensureRepo(dir: string, branch: string, url: string): Promise<void> {
  if (!fs.existsSync(path.join(dir, ".git"))) await git.init({ fs, dir, defaultBranch: branch });
  await git.addRemote({ fs, dir, remote: "origin", url, force: true });
}

/** Files that differ from the last commit, as a plugin-friendly list (no Cairn internals). */
export async function listChanges(dir: string): Promise<SyncChange[]> {
  const matrix = await git.statusMatrix({ fs, dir });
  const changes: SyncChange[] = [];
  for (const [file, head, workdir, stage] of matrix) {
    if (head === 1 && workdir === 1 && stage === 1) continue;
    if (isInternalPath(file)) continue;
    if (head === 0 && workdir === 0) continue; // added then removed again: nothing to sync
    changes.push({ path: file, state: head === 0 ? "added" : workdir === 0 ? "deleted" : "modified" });
  }
  return changes.sort((a, b) => a.path.localeCompare(b.path));
}

/**
 * Stages and commits exactly `paths` (a path is added, or removed if it no
 * longer exists); every other change stays uncommitted. Callers must pass
 * only paths that appear in listChanges. Returns how many files were committed.
 */
export async function commitSelected(
  dir: string,
  paths: string[],
  author: { name: string; email: string },
  message?: string
): Promise<number> {
  if (paths.length === 0) return 0;
  const gitignore = path.join(dir, ".gitignore");
  // Written lazily so adopting a remote that has its own .gitignore doesn't collide with ours.
  if (!fs.existsSync(gitignore)) fs.writeFileSync(gitignore, IGNORE_DEFAULT);
  for (const filepath of paths) {
    if (fs.existsSync(path.join(dir, filepath))) await git.add({ fs, dir, filepath });
    else await git.remove({ fs, dir, filepath });
  }
  await git.commit({
    fs,
    dir,
    author,
    message: message?.trim() || `Cairn sync: ${paths.length} file${paths.length === 1 ? "" : "s"} changed`,
  });
  return paths.length;
}

export async function commitAll(
  dir: string,
  author: { name: string; email: string },
  message?: string
): Promise<number> {
  const gitignore = path.join(dir, ".gitignore");
  if (!fs.existsSync(gitignore)) fs.writeFileSync(gitignore, IGNORE_DEFAULT);
  const changes = await listChanges(dir);
  return commitSelected(
    dir,
    changes.map((c) => c.path),
    author,
    message
  );
}

export async function isDirty(dir: string): Promise<boolean> {
  return (await listChanges(dir)).length > 0;
}

async function resolveOid(dir: string, ref: string): Promise<string | null> {
  try {
    return await git.resolveRef({ fs, dir, ref });
  } catch {
    return null;
  }
}

export interface SyncOptions {
  root: string;
  repoFullName: string;
  branch: string;
  token: string;
  author: { name: string; email: string };
  /** Only bring GitHub's changes down: never commit local edits or push. */
  pullOnly?: boolean;
  /** Commit only these (already validated) paths instead of every change. */
  paths?: string[];
  /** Commit message; a generated one is used when empty. */
  message?: string;
}

export async function syncFolder(opts: SyncOptions): Promise<SyncResult> {
  const { root: dir, repoFullName, branch, token, author } = opts;
  const url = `https://github.com/${repoFullName}.git`;
  const onAuth = () => ({ username: token, password: "x-oauth-basic" });
  const result: SyncResult = { status: "synced", message: "", committed: false, pushed: false, pulled: false };
  const ref = `refs/heads/${branch}`;
  const push = () => git.push({ fs, http, dir, remote: "origin", ref: branch, onAuth });
  const commit = async () =>
    opts.paths ? commitSelected(dir, opts.paths, author, opts.message) : commitAll(dir, author, opts.message);

  try {
    await ensureRepo(dir, branch, url);

    const info = await git.getRemoteInfo({ http, url, onAuth });
    const remoteOid = info.refs?.heads?.[branch] ?? null;
    if (remoteOid) {
      await git.fetch({ fs, http, dir, remote: "origin", ref: branch, singleBranch: true, tags: false, onAuth });
    }
    const localOid = await resolveOid(dir, ref);
    const hasWork = opts.paths ? opts.paths.length > 0 : (await listChanges(dir)).length > 0;

    let relation: SyncRelation;
    if (!remoteOid) relation = "no-remote";
    else if (!localOid) relation = "no-local";
    else if (localOid === remoteOid) relation = "same";
    else if (await git.isDescendent({ fs, dir, oid: localOid, ancestor: remoteOid })) relation = "ahead";
    else if (await git.isDescendent({ fs, dir, oid: remoteOid, ancestor: localOid })) relation = "behind";
    else relation = "diverged";

    let plan = planSync(relation, hasWork);
    if (plan.kind === "conflict") return { ...result, status: "conflict", message: plan.message };

    if (opts.pullOnly && plan.kind === "commit-push") {
      return { ...result, message: relation === "ahead" ? "Nothing new on GitHub." : "Already up to date." };
    }

    if (plan.kind === "fast-forward") {
      await git.writeRef({ fs, dir, ref, value: remoteOid!, force: true });
      try {
        await git.checkout({ fs, dir, ref: branch }); // non-forced: refuses to overwrite local edits
      } catch (err) {
        // Put the branch back so a refused pull leaves nothing half-applied.
        await git.writeRef({ fs, dir, ref, value: localOid!, force: true });
        const files = (err as { data?: { filepaths?: string[] } }).data?.filepaths;
        return {
          ...result,
          status: "conflict",
          message: files?.length
            ? `GitHub changed files you have edited locally: ${files.join(", ")}. Nothing was changed.`
            : "GitHub has changes that conflict with your local edits. Nothing was changed.",
        };
      }
      result.pulled = true;
      if (opts.pullOnly) return { ...result, message: "Pulled changes from GitHub." };
      plan = planSync("same", hasWork); // carry on: commit and push whatever was selected
    }

    if (plan.kind === "adopt-remote-then-commit-push") {
      await git.writeRef({ fs, dir, ref, value: remoteOid!, force: true });
      await git.checkout({ fs, dir, ref: branch }); // non-forced: throws rather than clobber local files
      result.pulled = true;
      if (opts.pullOnly) return { ...result, message: "Pulled changes from GitHub." };
      result.committed = hasWork && (await commit()) > 0;
      if (result.committed) {
        await push();
        result.pushed = true;
      }
    } else if (plan.kind === "commit-push") {
      if (plan.commit) result.committed = (await commit()) > 0;
      if (plan.push) {
        await push();
        result.pushed = true;
      }
    }

    const parts = [result.pulled && "pulled", result.committed && "committed", result.pushed && "pushed"].filter(Boolean);
    result.message = parts.length ? `Synced (${parts.join(", ")}).` : "Already up to date.";
    return result;
  } catch (err) {
    return { ...result, status: "error", message: err instanceof Error ? err.message : String(err) };
  }
}
