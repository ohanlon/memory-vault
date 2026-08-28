import { hasPermission } from "./pluginPermissions";
import type { PluginPermissionsFile } from "../shared/types";

export const EXTERNAL_URL_SCHEME_RE = /^(https?:|mailto:)/i;

function extractHostname(url: string): string | null {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

// Gates a plugin's own webContents (will-navigate / setWindowOpenHandler /
// webRequest.onBeforeRequest, all attached per-partition in pluginHost.ts)
// from reaching any network resource. Requires the "network" permission,
// and the domain must not be on that plugin's remembered deny list.
export function isAllowedForPlugin(url: string, pluginId: string, permissions: PluginPermissionsFile): boolean {
  if (!hasPermission(permissions, pluginId, "network")) return false;
  const hostname = extractHostname(url);
  if (!hostname) return false;
  const denied = permissions[pluginId]?.deniedDomains ?? [];
  return !denied.includes(hostname);
}

// Gates shell.openExternal — kept separate from isAllowedForPlugin because
// it hands the URL to the OS's default handler rather than loading it
// inside the app, so it's its own declared permission. `pluginId` is null
// for calls made by the host app itself (not from a plugin's window), which
// aren't gated at all — only plugin-originated calls go through this check.
export function isAllowedExternalUrl(
  url: string,
  pluginId: string | null,
  permissions: PluginPermissionsFile
): boolean {
  if (!EXTERNAL_URL_SCHEME_RE.test(url)) return false;
  if (pluginId === null) return true;
  return hasPermission(permissions, pluginId, "shell:openExternal");
}
