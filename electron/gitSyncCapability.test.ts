import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createGitSyncCapability, type CapabilityEnv } from "./gitSyncCapability";
import { writeToken } from "./githubAuth";
import { readSyncConfigFile, writeSyncConfigFile } from "./syncConfig";
import type { SyncResult } from "../shared/types";

const fakeCrypto = {
  isEncryptionAvailable: () => true,
  encryptString: (s: string) => Buffer.from(`enc:${s}`),
  decryptString: (b: Buffer) => b.toString().replace(/^enc:/, ""),
};

const OK: SyncResult = { status: "synced", message: "Synced (pushed).", committed: true, pushed: true, pulled: false };

describe("git-sync capability", () => {
  let dir = "";
  let env: CapabilityEnv;
  let enabled = true;
  let granted = true;
  const syncFolder = vi.fn(async () => OK);
  const listChanges = vi.fn(async () => [
    { path: "a.md", state: "modified" as const },
    { path: "dir/b.md", state: "added" as const },
  ]);

  const make = () => createGitSyncCapability(env);

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "capability-"));
    enabled = true;
    granted = true;
    syncFolder.mockClear();
    listChanges.mockClear();
    env = {
      clientId: "cid",
      tokenFile: path.join(dir, "token.bin"),
      syncConfigFile: path.join(dir, "sync.json"),
      crypto: fakeCrypto,
      isPluginEnabled: () => enabled,
      hasGitSyncPermission: () => granted,
      activeFolder: () => ({ name: "Work", root: path.join(dir, "work") }),
      registeredFolders: () => [
        { name: "Work", root: path.join(dir, "work") },
        { name: "Home", root: path.join(dir, "home") },
      ],
      openExternal: async () => {},
      deps: {
        listChanges,
        syncFolder: syncFolder as never,
        ensureRepo: async () => {},
        getUser: async () => ({ login: "octo" }),
      },
    };
    writeToken(env.tokenFile, "secret-token", fakeCrypto);
    writeSyncConfigFile(env.syncConfigFile, { Work: { repoFullName: "octo/work", branch: "main" } });
  });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  describe("gate", () => {
    it("refuses a disabled plugin", async () => {
      enabled = false;
      await expect(make().dispatch("p", "auth.status")).rejects.toThrow(/disabled/);
    });

    it("refuses a plugin without the git-sync permission", async () => {
      granted = false;
      await expect(make().dispatch("p", "sync.status")).rejects.toThrow(/git-sync/);
    });

    it("refuses unknown methods, including prototype names", async () => {
      await expect(make().dispatch("p", "nope")).rejects.toThrow(/Unknown method/);
      await expect(make().dispatch("p", "constructor")).rejects.toThrow(/Unknown method/);
      await expect(make().dispatch("p", "__proto__")).rejects.toThrow(/Unknown method/);
    });
  });

  describe("status and linking", () => {
    it("reports signed-in state without exposing the token", async () => {
      const status = await make().dispatch("p", "auth.status");
      expect(status).toEqual({ connected: true, login: "octo" });
      expect(JSON.stringify(status)).not.toContain("secret-token");
    });

    it("lists the active folder's changes when linked", async () => {
      const s = (await make().dispatch("p", "sync.status")) as { link: unknown; changes: unknown[] };
      expect(s.link).toMatchObject({ repoFullName: "octo/work" });
      expect(s.changes).toHaveLength(2);
    });

    it("reports an unlinked folder with no changes and without touching git", async () => {
      writeSyncConfigFile(env.syncConfigFile, {});
      const s = (await make().dispatch("p", "sync.status")) as { link: unknown; changes: unknown[] };
      expect(s).toMatchObject({ link: null, changes: [] });
      expect(listChanges).not.toHaveBeenCalled();
    });

    it("validates and stores a link, and can remove it", async () => {
      writeSyncConfigFile(env.syncConfigFile, {});
      const cap = make();
      await expect(cap.dispatch("p", "link.set", ["not a repo", "main"])).rejects.toThrow(/Invalid repository/);
      await expect(cap.dispatch("p", "link.set", ["a/b", "bad branch!"])).rejects.toThrow(/Invalid branch/);
      await cap.dispatch("p", "link.set", ["octo/notes", "main"]);
      expect(readSyncConfigFile(env.syncConfigFile)).toEqual({ Work: { repoFullName: "octo/notes", branch: "main" } });
      await cap.dispatch("p", "link.remove");
      expect(readSyncConfigFile(env.syncConfigFile)).toEqual({});
    });

    it("rejects repository names that could smuggle a path", async () => {
      await expect(make().dispatch("p", "repo.create", ["../evil", true])).rejects.toThrow(/Repository names/);
    });
  });

  describe("sync.commitPush", () => {
    it("syncs only the selected, changed files", async () => {
      const r = await make().dispatch("p", "sync.commitPush", [["a.md"], "msg"]);
      expect(r).toEqual(OK);
      expect(syncFolder).toHaveBeenCalledWith(
        expect.objectContaining({ paths: ["a.md"], message: "msg", pullOnly: false, repoFullName: "octo/work", token: "secret-token" })
      );
    });

    it("refuses paths that are not in the change list (including traversal)", async () => {
      await expect(make().dispatch("p", "sync.commitPush", [["../../etc/passwd"]])).rejects.toThrow(/Not a changed file/);
      await expect(make().dispatch("p", "sync.commitPush", [["unchanged.md"]])).rejects.toThrow(/Not a changed file/);
      expect(syncFolder).not.toHaveBeenCalled();
    });

    it("refuses a malformed selection", async () => {
      await expect(make().dispatch("p", "sync.commitPush", ["a.md"])).rejects.toThrow(/Invalid file selection/);
      await expect(make().dispatch("p", "sync.commitPush", [[1]])).rejects.toThrow(/Invalid file selection/);
    });

    it("refuses when the folder is not linked", async () => {
      writeSyncConfigFile(env.syncConfigFile, {});
      await expect(make().dispatch("p", "sync.commitPush", [["a.md"]])).rejects.toThrow(/isn't connected/);
    });

    it("records the result against the folder's link", async () => {
      await make().dispatch("p", "sync.commitPush", [["a.md"]]);
      expect(readSyncConfigFile(env.syncConfigFile).Work).toMatchObject({ lastStatus: "synced", lastMessage: "Synced (pushed)." });
    });
  });

  describe("sync.fetchAll", () => {
    it("pulls only linked folders, pull-only, and survives a failure", async () => {
      writeSyncConfigFile(env.syncConfigFile, {
        Work: { repoFullName: "octo/work", branch: "main" },
        Home: { repoFullName: "octo/home", branch: "main" },
      });
      syncFolder.mockImplementationOnce(async () => {
        throw new Error("boom");
      });
      const out = (await make().dispatch("p", "sync.fetchAll")) as { name: string; result: SyncResult }[];
      expect(out.map((o) => [o.name, o.result.status])).toEqual([
        ["Work", "error"],
        ["Home", "synced"],
      ]);
      expect(syncFolder).toHaveBeenLastCalledWith(expect.objectContaining({ pullOnly: true }));
    });
  });
});
