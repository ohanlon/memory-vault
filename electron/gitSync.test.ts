import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import git from "isomorphic-git";
import { afterEach, describe, expect, it } from "vitest";
import { commitAll, isDirty, planSync } from "./gitSync";

describe("planSync", () => {
  it("reports divergence as a conflict", () => {
    expect(planSync("diverged", false).kind).toBe("conflict");
  });
  it("fast-forwards only when clean", () => {
    expect(planSync("behind", false)).toEqual({ kind: "fast-forward" });
    expect(planSync("behind", true).kind).toBe("conflict");
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

describe("commitAll", () => {
  let dir = "";
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));
  const author = { name: "T", email: "t@example.com" };

  it("commits adds, edits and deletes, and leaves a clean tree", async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "gitsync-"));
    await git.init({ fs, dir, defaultBranch: "main" });
    fs.writeFileSync(path.join(dir, "a.md"), "one");
    expect(await isDirty(dir)).toBe(true);
    expect(await commitAll(dir, author)).toBeGreaterThan(0); // a.md + .gitignore
    expect(await isDirty(dir)).toBe(false);
    expect(await commitAll(dir, author)).toBe(0);

    fs.writeFileSync(path.join(dir, "a.md"), "two, edited");
    fs.writeFileSync(path.join(dir, "b.md"), "new");
    expect(await commitAll(dir, author)).toBe(2);
    fs.rmSync(path.join(dir, "a.md"));
    expect(await commitAll(dir, author)).toBe(1);
    expect(await git.listFiles({ fs, dir, ref: "HEAD" })).not.toContain("a.md");
    expect(await git.log({ fs, dir })).toHaveLength(3);
  });
});
