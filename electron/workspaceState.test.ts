import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { readWorkspaceState, workspaceStateFilePath, writeWorkspaceState } from "./workspaceState";
import { DEFAULT_WORKSPACE_STATE } from "../shared/workspaceState";

describe("readWorkspaceState / writeWorkspaceState", () => {
  const root = path.join(os.tmpdir(), `workspace-state-test-${process.pid}`);

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("returns defaults when the file does not exist", () => {
    expect(readWorkspaceState(root)).toEqual(DEFAULT_WORKSPACE_STATE);
  });

  it("creates the .cairn directory on first write", () => {
    expect(fs.existsSync(path.join(root, ".cairn"))).toBe(false);
    writeWorkspaceState(root, {
      openTabs: [{ root, relativePath: "a.md" }],
      activeTab: { root, relativePath: "a.md" },
    });
    expect(fs.existsSync(workspaceStateFilePath(root))).toBe(true);
  });

  it("round-trips state through disk", () => {
    const state = {
      openTabs: [{ root, relativePath: "sub/a.md" }, "@graph"],
      activeTab: "@graph",
    };
    writeWorkspaceState(root, state);
    expect(readWorkspaceState(root)).toEqual(state);
  });

  it("qualifies a bare relative-path entry with the notes folder root on read", () => {
    fs.mkdirSync(path.join(root, ".cairn"), { recursive: true });
    fs.writeFileSync(workspaceStateFilePath(root), JSON.stringify({ openTabs: ["a.md"], activeTab: "a.md" }));
    expect(readWorkspaceState(root)).toEqual({
      openTabs: [{ root, relativePath: "a.md" }],
      activeTab: { root, relativePath: "a.md" },
    });
  });

  it("returns defaults for corrupt JSON instead of throwing", () => {
    fs.mkdirSync(path.join(root, ".cairn"), { recursive: true });
    fs.writeFileSync(workspaceStateFilePath(root), "{not valid json", "utf-8");
    expect(readWorkspaceState(root)).toEqual(DEFAULT_WORKSPACE_STATE);
  });
});
