import { contextBridge, ipcRenderer } from "electron";
import type { PluginPermission } from "../shared/types";

// The plugin's own identity, baked in via BrowserWindow's
// webPreferences.additionalArguments (see pluginHost.ts) rather than trusted
// from the plugin's own JS, since that argv is set by the main process.
function argValue(flag: string): string {
  const arg = process.argv.find((a) => a.startsWith(`--${flag}=`));
  return arg ? arg.slice(flag.length + 3) : "";
}

const pluginId = argValue("cairn-plugin-id");
const pluginName = argValue("cairn-plugin-name");

// Deliberately minimal: only note read/write against the current stack is
// exposed by default (Cairn's core value prop, no prompt needed). Everything
// else — network, shell.openExternal, navigation — is gated behind
// requestPermission, which prompts the user the first time and is then
// enforced by electron/domainPolicy.ts on this window's own session.
const api = {
  readNote: (relativePath: string): Promise<string> => ipcRenderer.invoke("plugin:notes:read", relativePath),
  writeNote: (relativePath: string, body: string): Promise<boolean> =>
    ipcRenderer.invoke("plugin:notes:write", relativePath, body),
  requestPermission: (permission: PluginPermission): Promise<boolean> =>
    ipcRenderer.invoke("plugin:requestPermission", pluginId, pluginName, permission),
};

export type CairnPluginAPI = typeof api;

contextBridge.exposeInMainWorld("cairnPlugin", api);
