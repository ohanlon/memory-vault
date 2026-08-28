import fs from "node:fs";
import path from "node:path";
import type { PluginPermission, PluginPermissionState, PluginPermissionsFile } from "../shared/types";

export type { PluginPermissionState, PluginPermissionsFile };

function isValidState(v: unknown): v is PluginPermissionState {
  if (!v || typeof v !== "object") return false;
  const s = v as Record<string, unknown>;
  return Array.isArray(s.granted) && (s.deniedDomains === undefined || Array.isArray(s.deniedDomains));
}

export function readPluginPermissionsFile(filePath: string): PluginPermissionsFile {
  if (!fs.existsSync(filePath)) return {};
  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    const result: PluginPermissionsFile = {};
    for (const [pluginId, state] of Object.entries(parsed)) {
      if (isValidState(state)) result[pluginId] = state;
    }
    return result;
  } catch {
    return {};
  }
}

export function writePluginPermissionsFile(filePath: string, permissions: PluginPermissionsFile): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(permissions, null, 2), "utf-8");
}

export function hasPermission(
  permissions: PluginPermissionsFile,
  pluginId: string,
  permission: PluginPermission
): boolean {
  return permissions[pluginId]?.granted.includes(permission) ?? false;
}

export function grantPermission(
  permissions: PluginPermissionsFile,
  pluginId: string,
  permission: PluginPermission
): PluginPermissionsFile {
  const existing = permissions[pluginId] ?? { granted: [] };
  if (existing.granted.includes(permission)) return permissions;
  return {
    ...permissions,
    [pluginId]: { ...existing, granted: [...existing.granted, permission] },
  };
}

export function revokePermission(
  permissions: PluginPermissionsFile,
  pluginId: string,
  permission: PluginPermission
): PluginPermissionsFile {
  const existing = permissions[pluginId];
  if (!existing) return permissions;
  return {
    ...permissions,
    [pluginId]: { ...existing, granted: existing.granted.filter((p) => p !== permission) },
  };
}
