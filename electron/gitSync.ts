import fs from "node:fs";
import path from "node:path";
import git from "isomorphic-git";
import http from "isomorphic-git/http/node";
import type { SyncResult } from "../shared/types";

export type SyncRelation = "no-remote" | "no-local" | "same" | "ahead" | "behind" | "diverged";

export type SyncPlan =
  | { kind: "conflict"; message: string }
  | { kind: "fast-forward" }
  | { kind: "adopt-remote-then-commit-push" }
  | { kind: "commit-push"; commit: boolean; push: boolean };

// Pure decision logic, kept apart from the isomorphic-git calls so every
// branch can be tested without a network. Never overwrites either side:
// anything that would need a merge is reported as a conflict instead.
export function planSync(relation: SyncRelation, dirty: boolean): SyncPlan {
  switch (relation) {
    case "diverged":
      return {
        kind: "conflict",
        message: "This folder and the GitHub repo have different histories. Nothing was changed; resolve it manually.",
      };
    case "behind":
      return dirty
        ? { kind: "conflict", message: "GitHub has newer changes and this folder has local edits. Nothing was changed; resolve it manually." }
        : { kind: "fast-forward" };
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

const IGNORE_DEFAULT = ".DS_Store\nThumbs.db\n";

export async function isDirty(dir: string): Promise<boolean> {
  const matrix = await git.statusMatrix({ fs, dir });
  return matrix.some(([, head, workdir, stage]) => !(head === 1 && workdir === 1 && stage === 1));
}

export async function commitAll(dir: string, author: { name: string; email: string }): Promise<number> {
  // Written lazily so adopting a remote that has its own .gitignore doesn't
  // collide with ours.
  const gitignore = path.join(dir, ".gitignore");
  if (!fs.existsSync(gitignore)) fs.writeFileSync(gitignore, IGNORE_DEFAULT);
  const matrix = await git.statusMatrix({ fs, dir });
  let changed = 0;
  for (const [file, head, workdir, stage] of matrix) {
    if (head === 1 && workdir === 1 && stage === 1) continue;
    changed++;
    if (workdir === 0) await git.remove({ fs, dir, filepath: file });
    else await git.add({ fs, dir, filepath: file });
  }
  if (changed === 0) return 0;
  await git.commit({
    fs,
    dir,
    author,
    message: `Cairn sync: ${changed} file${changed === 1 ? "" : "s"} changed`,
  });
  return changed;
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
}

export async function syncFolder(opts: SyncOptions): Promise<SyncResult> {
  const { root: dir, repoFullName, branch, token, author } = opts;
  const url = `https://github.com/${repoFullName}.git`;
  const onAuth = () => ({ username: token, password: "x-oauth-basic" });
  const result: SyncResult = { status: "synced", message: "", committed: false, pushed: false, pulled: false };

  try {
    if (!fs.existsSync(path.join(dir, ".git"))) await git.init({ fs, dir, defaultBranch: branch });
    await git.addRemote({ fs, dir, remote: "origin", url, force: true });

    const info = await git.getRemoteInfo({ http, url, onAuth });
    const remoteOid = info.refs?.heads?.[branch] ?? null;
    if (remoteOid) {
      await git.fetch({ fs, http, dir, remote: "origin", ref: branch, singleBranch: true, tags: false, onAuth });
    }
    const localOid = await resolveOid(dir, `refs/heads/${branch}`);
    const dirty = await isDirty(dir);

    let relation: SyncRelation;
    if (!remoteOid) relation = "no-remote";
    else if (!localOid) relation = "no-local";
    else if (localOid === remoteOid) relation = "same";
    else if (await git.isDescendent({ fs, dir, oid: localOid, ancestor: remoteOid })) relation = "ahead";
    else if (await git.isDescendent({ fs, dir, oid: remoteOid, ancestor: localOid })) relation = "behind";
    else relation = "diverged";

    const plan = planSync(relation, dirty);
    if (plan.kind === "conflict") return { ...result, status: "conflict", message: plan.message };

    if (opts.pullOnly && plan.kind === "commit-push") {
      return { ...result, message: relation === "ahead" ? "Nothing new on GitHub." : "Already up to date." };
    }

    if (plan.kind === "fast-forward") {
      await git.writeRef({ fs, dir, ref: `refs/heads/${branch}`, value: remoteOid!, force: true });
      await git.checkout({ fs, dir, ref: branch });
      return { ...result, pulled: true, message: "Pulled changes from GitHub." };
    }

    if (plan.kind === "adopt-remote-then-commit-push") {
      await git.writeRef({ fs, dir, ref: `refs/heads/${branch}`, value: remoteOid!, force: true });
      await git.checkout({ fs, dir, ref: branch }); // non-forced: throws rather than clobber local files
      result.pulled = true;
      if (opts.pullOnly) return { ...result, message: "Pulled changes from GitHub." };
      result.committed = (await commitAll(dir, author)) > 0;
      if (result.committed) {
        await git.push({ fs, http, dir, remote: "origin", ref: branch, onAuth });
        result.pushed = true;
      }
    } else {
      if (plan.commit) result.committed = (await commitAll(dir, author)) > 0;
      if (plan.push) {
        await git.push({ fs, http, dir, remote: "origin", ref: branch, onAuth });
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
