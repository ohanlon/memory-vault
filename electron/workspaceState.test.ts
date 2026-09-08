import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  cairnWorkspaceStateFilePath,
  readCairnWorkspaceState,
  readWorkspaceState,
  workspaceStateFilePath,
  writeCairnWorkspaceState,
  writeWorkspaceState,
} from "./workspaceState";
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
    writeWorkspaceState(stackRoot, {
      openTabs: [{ root: stackRoot, relativePath: "a.md" }],
      activeTab: { root: stackRoot, relativePath: "a.md" },
    });
    expect(fs.existsSync(workspaceStateFilePath(stackRoot))).toBe(true);
  });

  it("round-trips state through disk", () => {
    const state = {
      openTabs: [{ root: stackRoot, relativePath: "sub/a.md" }, "@graph"],
      activeTab: "@graph",
    };
    writeWorkspaceState(stackRoot, state);
    expect(readWorkspaceState(stackRoot)).toEqual(state);
  });

  it("qualifies a pre-Cairn bare relative-path entry with the stack root on read", () => {
    fs.mkdirSync(path.join(stackRoot, ".cairn"), { recursive: true });
    fs.writeFileSync(workspaceStateFilePath(stackRoot), JSON.stringify({ openTabs: ["a.md"], activeTab: "a.md" }));
    expect(readWorkspaceState(stackRoot)).toEqual({
      openTabs: [{ root: stackRoot, relativePath: "a.md" }],
      activeTab: { root: stackRoot, relativePath: "a.md" },
    });
  });

  it("returns defaults for corrupt JSON instead of throwing", () => {
    fs.mkdirSync(path.join(stackRoot, ".cairn"), { recursive: true });
    fs.writeFileSync(workspaceStateFilePath(stackRoot), "{not valid json", "utf-8");
    expect(readWorkspaceState(stackRoot)).toEqual(DEFAULT_WORKSPACE_STATE);
  });
});

describe("readCairnWorkspaceState / writeCairnWorkspaceState", () => {
  const userDataDir = path.join(os.tmpdir(), `cairn-workspace-state-test-${process.pid}`);
  const cairnName = "Life";

  afterEach(() => {
    fs.rmSync(userDataDir, { recursive: true, force: true });
  });

  it("returns defaults when the file does not exist", () => {
    expect(readCairnWorkspaceState(userDataDir, cairnName)).toEqual(DEFAULT_WORKSPACE_STATE);
  });

  it("round-trips root-qualified tabs from more than one member stack", () => {
    const state = {
      openTabs: [
        { root: "/stacks/work", relativePath: "a.md" },
        { root: "/stacks/personal", relativePath: "b.md" },
      ],
      activeTab: { root: "/stacks/personal", relativePath: "b.md" },
    };
    writeCairnWorkspaceState(userDataDir, cairnName, state);
    expect(fs.existsSync(cairnWorkspaceStateFilePath(userDataDir, cairnName))).toBe(true);
    expect(readCairnWorkspaceState(userDataDir, cairnName)).toEqual(state);
  });
});
