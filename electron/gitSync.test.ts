import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import git from "isomorphic-git";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { commitAll, commitSelected, isDirty, listChanges, planSync } from "./gitSync";

describe("planSync", () => {
  it("reports divergence as a conflict", () => {
    expect(planSync("diverged", false).kind).toBe("conflict");
  });
  it("fast-forwards when behind, with or without local edits", () => {
    expect(planSync("behind", false)).toEqual({ kind: "fast-forward" });
    expect(planSync("behind", true)).toEqual({ kind: "fast-forward" });
  });
  it("pushes first commit to an empty remote", () => {
    expect(planSync("no-remote", true)).toEqual({ kind: "commit-push", commit: true, push: true });
  });
  it("is a no-op when same and clean, pushes when same and dirty", () => {
    expect(planSync("same", false)).toEqual({ kind: "commit-push", commit: false, push: false });
    expect(planSync("same", true)).toEqual({ kind: "commit-push", commit: true, push: true });
  });
  it("pushes unpushed local commits when ahead", () => {
    expect(planSync("ahead", false)).toEqual({ kind: "commit-push", commit: false, push: true });
  });
  it("adopts the remote when there is no local history", () => {
    expect(planSync("no-local", true).kind).toBe("adopt-remote-then-commit-push");
  });
});

describe("local git operations", () => {
  let dir = "";
  const author = { name: "T", email: "t@example.com" };
  const write = (rel: string, body: string) => {
    fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    fs.writeFileSync(path.join(dir, rel), body);
  };

  beforeEach(async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "gitsync-"));
    await git.init({ fs, dir, defaultBranch: "main" });
  });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  it("commitAll commits adds, edits and deletes, and leaves a clean tree", async () => {
    write("a.md", "one");
    expect(await isDirty(dir)).toBe(true);
    expect(await commitAll(dir, author)).toBeGreaterThan(0); // a.md + .gitignore
    expect(await isDirty(dir)).toBe(false);
    expect(await commitAll(dir, author)).toBe(0);

    write("a.md", "two, edited");
    write("b.md", "new");
    expect(await commitAll(dir, author)).toBe(2);
    fs.rmSync(path.join(dir, "a.md"));
    expect(await commitAll(dir, author)).toBe(1);
    expect(await git.listFiles({ fs, dir, ref: "HEAD" })).not.toContain("a.md");
    expect(await git.log({ fs, dir })).toHaveLength(3);
  });

  it("listChanges reports added, modified and deleted files and hides Cairn internals", async () => {
    write("keep.md", "k");
    write("edit.md", "before");
    write("gone.md", "g");
    await commitAll(dir, author);

    write("edit.md", "after, longer");
    fs.rmSync(path.join(dir, "gone.md"));
    write("new/deep.md", "n");
    write(".cairn/index.json", "{}");

    expect(await listChanges(dir)).toEqual([
      { path: "edit.md", state: "modified" },
      { path: "gone.md", state: "deleted" },
      { path: "new/deep.md", state: "added" },
    ]);
  });

  it("the default .gitignore keeps .cairn out of commits", async () => {
    write("a.md", "a");
    write(".cairn/index.json", "{}");
    await commitAll(dir, author);
    expect(await git.listFiles({ fs, dir, ref: "HEAD" })).toEqual([".gitignore", "a.md"]);
  });

  it("commitSelected commits only the chosen files and leaves the rest as changes", async () => {
    write("a.md", "a");
    write("b.md", "b");
    write("c.md", "c");
    await commitAll(dir, author);

    write("a.md", "a, edited");
    write("b.md", "b, edited");
    fs.rmSync(path.join(dir, "c.md"));
    expect(await commitSelected(dir, ["a.md", "c.md"], author, "my message")).toBe(2);

    expect(await listChanges(dir)).toEqual([{ path: "b.md", state: "modified" }]);
    const [latest] = await git.log({ fs, dir, depth: 1 });
    expect(latest.commit.message.trim()).toBe("my message");
    expect(await git.listFiles({ fs, dir, ref: "HEAD" })).not.toContain("c.md");
  });

  it("commitSelected with no paths does nothing", async () => {
    write("a.md", "a");
    expect(await commitSelected(dir, [], author)).toBe(0);
    expect(await git.log({ fs, dir }).catch(() => [])).toHaveLength(0);
  });

  // The fast-forward in syncFolder relies on isomorphic-git's non-forced
  // checkout refusing to clobber local edits (and on us restoring the ref).
  describe("fast-forward checkout with local edits", () => {
    async function twoCommits() {
      write("a.md", "version one");
      write("b.md", "b one");
      await commitAll(dir, author);
      const c1 = await git.resolveRef({ fs, dir, ref: "refs/heads/main" });
      write("a.md", "version two, changed upstream");
      await commitAll(dir, author);
      const c2 = await git.resolveRef({ fs, dir, ref: "refs/heads/main" });
      // Rewind the working tree to c1, as if GitHub's c2 hadn't been pulled yet.
      await git.writeRef({ fs, dir, ref: "refs/heads/main", value: c1, force: true });
      await git.checkout({ fs, dir, ref: "main", force: true });
      return { c1, c2 };
    }

    it("applies upstream changes alongside unrelated local edits", async () => {
      const { c2 } = await twoCommits();
      write("b.md", "b local edit, unselected");
      await git.writeRef({ fs, dir, ref: "refs/heads/main", value: c2, force: true });
      await git.checkout({ fs, dir, ref: "main" });
      expect(fs.readFileSync(path.join(dir, "a.md"), "utf-8")).toBe("version two, changed upstream");
      expect(fs.readFileSync(path.join(dir, "b.md"), "utf-8")).toBe("b local edit, unselected");
    });

    it("refuses when an upstream-changed file is edited locally, leaving it untouched", async () => {
      const { c2 } = await twoCommits();
      write("a.md", "my own edit, longer text");
      await git.writeRef({ fs, dir, ref: "refs/heads/main", value: c2, force: true });
      await expect(git.checkout({ fs, dir, ref: "main" })).rejects.toBeTruthy();
      expect(fs.readFileSync(path.join(dir, "a.md"), "utf-8")).toBe("my own edit, longer text");
    });
  });
});
