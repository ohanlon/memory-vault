import fs from "node:fs";
import path from "node:path";
import { DEFAULT_WORKSPACE_STATE, normalizeWorkspaceState } from "../shared/workspaceState";
import type { WorkspaceState } from "../shared/types";

export function workspaceStateFilePath(stackRoot: string): string {
  return path.join(stackRoot, ".cairn", "workspace.json");
}

export function readWorkspaceState(stackRoot: string): WorkspaceState {
  const filePath = workspaceStateFilePath(stackRoot);
  if (!fs.existsSync(filePath)) return DEFAULT_WORKSPACE_STATE;
  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    return normalizeWorkspaceState(JSON.parse(raw));
  } catch {
    return DEFAULT_WORKSPACE_STATE;
  }
}

export function writeWorkspaceState(stackRoot: string, state: WorkspaceState): void {
  const filePath = workspaceStateFilePath(stackRoot);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(normalizeWorkspaceState(state), null, 2), "utf-8");
}
