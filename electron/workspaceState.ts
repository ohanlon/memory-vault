import fs from "node:fs";
import path from "node:path";
import { DEFAULT_WORKSPACE_STATE, normalizeWorkspaceState } from "../shared/workspaceState";
import type { WorkspaceState } from "../shared/types";

export function workspaceStateFilePath(root: string): string {
  return path.join(root, ".cairn", "workspace.json");
}

export function readWorkspaceState(root: string): WorkspaceState {
  const filePath = workspaceStateFilePath(root);
  if (!fs.existsSync(filePath)) return DEFAULT_WORKSPACE_STATE;
  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    return normalizeWorkspaceState(JSON.parse(raw), root);
  } catch {
    return DEFAULT_WORKSPACE_STATE;
  }
}

export function writeWorkspaceState(root: string, state: WorkspaceState): void {
  const filePath = workspaceStateFilePath(root);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(normalizeWorkspaceState(state, root), null, 2), "utf-8");
}
