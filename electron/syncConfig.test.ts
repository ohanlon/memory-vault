import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  readSyncConfigFile,
  removeSyncLink,
  renameSyncLink,
  setSyncLink,
  writeSyncConfigFile,
} from "./syncConfig";

const link = { repoFullName: "me/notes", branch: "main" };
const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

describe("syncConfig", () => {
  it("round-trips through disk and tolerates a missing or corrupt file", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sync-"));
    dirs.push(dir);
    const file = path.join(dir, "sync-config.json");
    expect(readSyncConfigFile(file)).toEqual({});
    writeSyncConfigFile(file, { Work: link });
    expect(readSyncConfigFile(file)).toEqual({ Work: link });
    fs.writeFileSync(file, "{nope");
    expect(readSyncConfigFile(file)).toEqual({});
  });

  it("drops malformed entries on read", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "sync-"));
    dirs.push(dir);
    const file = path.join(dir, "c.json");
    fs.writeFileSync(file, JSON.stringify({ Good: link, Bad: { repoFullName: 3 } }));
    expect(readSyncConfigFile(file)).toEqual({ Good: link });
  });

  it("sets, removes and renames case-insensitively", () => {
    const c = setSyncLink({}, "Work", link);
    expect(removeSyncLink(c, "work")).toEqual({});
    expect(renameSyncLink(c, "WORK", "Job")).toEqual({ Job: link });
    expect(renameSyncLink(c, "Other", "X")).toBe(c);
  });
});
