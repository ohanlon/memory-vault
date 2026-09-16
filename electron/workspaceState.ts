import fs from "node:fs";
import path from "node:path";
import { DEFAULT_WORKSPACE_STATE, normalizeWorkspaceState } from "../shared/workspaceState";
import type { WorkspaceState } from "../shared/types";

function readWorkspaceStateFile(filePath: string, fallbackRoot: string): WorkspaceState {
  if (!fs.existsSync(filePath)) return DEFAULT_WORKSPACE_STATE;
  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    return normalizeWorkspaceState(JSON.parse(raw), fallbackRoot);
  } catch {
    return DEFAULT_WORKSPACE_STATE;
  }
}

function writeWorkspaceStateFile(filePath: string, fallbackRoot: string, state: WorkspaceState): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(normalizeWorkspaceState(state, fallbackRoot), null, 2), "utf-8");
}

export function workspaceStateFilePath(stackRoot: string): string {
  return path.join(stackRoot, ".cairn", "workspace.json");
}

export function readWorkspaceState(stackRoot: string): WorkspaceState {
  return readWorkspaceStateFile(workspaceStateFilePath(stackRoot), stackRoot);
}

export function writeWorkspaceState(stackRoot: string, state: WorkspaceState): void {
  writeWorkspaceStateFile(workspaceStateFilePath(stackRoot), stackRoot, state);
}

/** A merged view-scoped workspace file lives in userData, not inside any one
 *  member stack's own folder — there's no single owning root to nest it
 *  under. */
export function mergedViewWorkspaceStateFilePath(userDataDir: string, mergedViewName: string): string {
  return path.join(userDataDir, "mergedViews", mergedViewName, "workspace.json");
}

export function readMergedViewWorkspaceState(userDataDir: string, mergedViewName: string): WorkspaceState {
  return readWorkspaceStateFile(mergedViewWorkspaceStateFilePath(userDataDir, mergedViewName), "");
}

export function writeMergedViewWorkspaceState(userDataDir: string, mergedViewName: string, state: WorkspaceState): void {
  writeWorkspaceStateFile(mergedViewWorkspaceStateFilePath(userDataDir, mergedViewName), "", state);
}
