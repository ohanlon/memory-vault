import fs from "node:fs";
import path from "node:path";
import { protocol } from "electron";
import { hasPermission, readPluginPermissionsFile } from "./pluginPermissions";
import type { DiscoveredPlugin } from "./pluginRegistry";
import type { PluginPermissionsFile } from "../shared/types";
import { PLUGIN_SCHEME, PLUGIN_SDK_PATH } from "../shared/pluginProtocol";

export { PLUGIN_SCHEME };

// Each plugin's UI is served from its own cairn-plugin://<pluginId>/ origin
// rather than shared file:// paths — a real origin boundary (distinct from
// the host and from every other plugin), and the hostname doubles as an
// unspoofable way to identify which plugin issued a given request (see the
// webRequest hook wired up alongside this in main.ts).

export function registerPluginScheme(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: PLUGIN_SCHEME,
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        corsEnabled: true,
        allowServiceWorkers: true,
      },
    },
  ]);
}

const MIME_TYPES: Record<string, string> = {
  ".html": "text/html",
  ".htm": "text/html",
  ".js": "text/javascript",
  ".mjs": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".gif": "image/gif",
};

export function contentTypeFor(filePath: string): string {
  return MIME_TYPES[path.extname(filePath).toLowerCase()] ?? "application/octet-stream";
}

/**
 * A plugin has no legitimate reason to fetch network resources directly —
 * `network` grants only the RPC bridge's fetch-on-the-plugin's-behalf path
 * (not implemented yet) is out of scope; today `network` simply widens what
 * the plugin's own `fetch()` calls inside its iframe can reach, gated here
 * via CSP and separately via the webRequest hook in main.ts (belt and
 * braces: CSP is enforced by the plugin's own browsing context and can't be
 * bypassed by iframe script, but the webRequest hook also covers
 * navigation-driven requests CSP's connect-src doesn't restrict).
 */
export function buildContentSecurityPolicy(pluginId: string, permissions: PluginPermissionsFile): string {
  // CSP doesn't allow mixing 'none' with other source expressions in the
  // same directive — "'self' 'none'" is invalid and gets silently ignored
  // (falling back to default-src, which is *more* permissive than
  // intended). Without network, 'self' alone still lets the plugin fetch
  // its own same-origin resources; with it, https/wss widen from there.
  const connectSrc = hasPermission(permissions, pluginId, "network") ? "'self' https: wss:" : "'self'";
  return [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:",
    `connect-src ${connectSrc}`,
    "object-src 'none'",
  ].join("; ");
}

/**
 * Resolves a request path against a plugin's own directory, refusing
 * anything that escapes it (e.g. "../../../etc/passwd") — mirrors
 * resolveWithinStackRoot in main.ts for the same reason.
 */
export function resolvePluginFilePath(pluginDir: string, requestPathname: string, mainEntry: string): string | null {
  const decoded = decodeURIComponent(requestPathname);
  const relative = decoded === "/" || decoded === "" ? mainEntry : decoded.replace(/^\/+/, "");
  const resolvedDir = path.resolve(pluginDir);
  const resolved = path.resolve(resolvedDir, relative);
  const rel = path.relative(resolvedDir, resolved);
  if (rel.startsWith("..") || path.isAbsolute(rel)) return null;
  return resolved;
}

// Synthesized (not read from disk) so every plugin gets the same
// postMessage-based RPC client regardless of what it ships — this is what
// replaces pluginPreload.ts's contextBridge, which only works for a real
// BrowserWindow/webview, not a plain sandboxed <iframe>.
export function buildSdkScript(): string {
  return `(function () {
  var pending = new Map();
  var counter = 0;
  var contextMenuListeners = [];
  window.addEventListener("message", function (event) {
    if (event.source !== window.parent) return;
    var data = event.data;
    if (!data || data.channel !== "cairn-plugin-rpc") return;
    if (data.kind === "response") {
      var entry = pending.get(data.id);
      if (!entry) return;
      pending.delete(data.id);
      if (data.error) entry.reject(new Error(data.error));
      else entry.resolve(data.result);
      return;
    }
    if (data.kind === "push" && data.event === "contextMenuAction") {
      contextMenuListeners.forEach(function (cb) { cb(data.itemId, data.targetPath); });
    }
  });
  function call(method, args) {
    var id = ++counter;
    return new Promise(function (resolve, reject) {
      pending.set(id, { resolve: resolve, reject: reject });
      window.parent.postMessage(
        { channel: "cairn-plugin-rpc", kind: "request", id: id, method: method, args: args },
        "*"
      );
    });
  }
  window.cairnPlugin = {
    readNote: function (relativePath) { return call("readNote", [relativePath]); },
    writeNote: function (relativePath, body) { return call("writeNote", [relativePath, body]); },
    requestPermission: function (permission) { return call("requestPermission", [permission]); },
    openExternal: function (url) { return call("openExternal", [url]); },
    setStatus: function (text) { return call("setStatus", [text]); },
    onContextMenuAction: function (cb) { contextMenuListeners.push(cb); },
  };
})();
`;
}

export function handlePluginProtocol(
  getCurrentPlugins: () => DiscoveredPlugin[],
  permissionsFilePath: string
): void {
  protocol.handle(PLUGIN_SCHEME, async (request) => {
    const url = new URL(request.url);
    const pluginId = url.hostname;
    const plugin = getCurrentPlugins().find((p) => p.manifest.id === pluginId);
    if (!plugin) return new Response("Plugin not found", { status: 404 });

    const permissions = readPluginPermissionsFile(permissionsFilePath);
    const csp = buildContentSecurityPolicy(pluginId, permissions);

    if (url.pathname === PLUGIN_SDK_PATH) {
      return new Response(buildSdkScript(), {
        headers: { "Content-Type": "text/javascript", "Content-Security-Policy": csp },
      });
    }

    const filePath = resolvePluginFilePath(plugin.dir, url.pathname, plugin.manifest.main);
    if (!filePath || !fs.existsSync(filePath)) return new Response("Not found", { status: 404 });

    const body = fs.readFileSync(filePath);
    return new Response(body, {
      headers: { "Content-Type": contentTypeFor(filePath), "Content-Security-Policy": csp },
    });
  });
}
