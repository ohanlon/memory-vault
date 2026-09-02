import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { readWorkspaceState, workspaceStateFilePath, writeWorkspaceState } from "./workspaceState";
import { DEFAULT_WORKSPACE_STATE } from "../shared/workspaceState";

describe("readWorkspaceState / writeWorkspaceState", () => {
  const stackRoot = path.join(os.tmpdir(), `workspace-state-test-${process.pid}`);

  afterEach(() => {
    fs.rmSync(stackRoot, { recursive: true, force: true });
  });

  it("returns defaults when the file does not exist", () => {
    expect(readWorkspaceState(stackRoot)).toEqual(DEFAULT_WORKSPACE_STATE);
  });

  it("creates the .cairn directory on first write", () => {
    expect(fs.existsSync(path.join(stackRoot, ".cairn"))).toBe(false);
    writeWorkspaceState(stackRoot, { collapsedFolders: [], openTabs: ["a.md"], activeTab: "a.md" });
    expect(fs.existsSync(workspaceStateFilePath(stackRoot))).toBe(true);
  });

  it("round-trips state through disk", () => {
    const state = { collapsedFolders: ["sub"], openTabs: ["sub/a.md", "@graph"], activeTab: "@graph" };
    writeWorkspaceState(stackRoot, state);
    expect(readWorkspaceState(stackRoot)).toEqual(state);
  });

  it("returns defaults for corrupt JSON instead of throwing", () => {
    fs.mkdirSync(path.join(stackRoot, ".cairn"), { recursive: true });
    fs.writeFileSync(workspaceStateFilePath(stackRoot), "{not valid json", "utf-8");
    expect(readWorkspaceState(stackRoot)).toEqual(DEFAULT_WORKSPACE_STATE);
  });
});
