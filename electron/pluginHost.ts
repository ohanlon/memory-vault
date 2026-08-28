import { BrowserWindow } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isAllowedForPlugin } from "./domainPolicy";
import { readPluginPermissionsFile } from "./pluginPermissions";
import type { DiscoveredPlugin } from "./pluginRegistry";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// One dedicated Chromium session per plugin — isolates cookies/storage
// between plugins and gives the webRequest/navigation handlers below a
// partition-scoped surface, so denying one plugin's network access can't
// affect another plugin or the host window.
export function pluginPartition(pluginId: string): string {
  return `persist:plugin:${pluginId}`;
}

// webContents.id -> plugin id, so IPC handlers in main.ts (e.g.
// shell:openExternal) can tell which plugin — if any — made the call.
const pluginIdByWebContentsId = new Map<number, string>();

export function pluginIdForWebContents(webContentsId: number): string | undefined {
  return pluginIdByWebContentsId.get(webContentsId);
}

// Each plugin runs in its own hidden BrowserWindow rather than an iframe in
// the host renderer or a Worker: this is the only mechanism that gives
// plugin code a real process/webContents boundary (so it can't reach
// window.memoryStack or the host's JS realm) while still letting it render
// a React UI contribution.
export function createPluginWindow(plugin: DiscoveredPlugin, permissionsFilePath: string): BrowserWindow {
  const pluginId = plugin.manifest.id;
  const win = new BrowserWindow({
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "pluginPreload.mjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      partition: pluginPartition(pluginId),
      additionalArguments: [`--cairn-plugin-id=${pluginId}`, `--cairn-plugin-name=${plugin.manifest.name}`],
    },
  });

  pluginIdByWebContentsId.set(win.webContents.id, pluginId);
  win.on("closed", () => pluginIdByWebContentsId.delete(win.webContents.id));

  const isAllowed = (url: string) => isAllowedForPlugin(url, pluginId, readPluginPermissionsFile(permissionsFilePath));

  win.webContents.setWindowOpenHandler(({ url }) => ({ action: isAllowed(url) ? "allow" : "deny" }));
  win.webContents.on("will-navigate", (event, url) => {
    if (!isAllowed(url)) event.preventDefault();
  });
  win.webContents.session.webRequest.onBeforeRequest((details, callback) => {
    callback({ cancel: !isAllowed(details.url) });
  });

  win.loadFile(path.join(plugin.dir, plugin.manifest.main));
  return win;
}
