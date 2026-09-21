import os from "node:os";
import path from "node:path";

// Mirrors Electron's default `app.getPath("userData")` (appData + app
// name, where app name defaults to package.json's "name" field, "cairn")
// for a standalone Node process - i.e. the MCP server, which doesn't run
// inside Electron and so has no `app` object to ask.
// https://www.electronjs.org/docs/latest/api/app#appgetpathname
export function cairnUserDataDir(): string {
  const appName = "cairn";
  if (process.platform === "win32") {
    const appData = process.env.APPDATA ?? path.join(os.homedir(), "AppData", "Roaming");
    return path.join(appData, appName);
  }
  if (process.platform === "darwin") {
    return path.join(os.homedir(), "Library", "Application Support", appName);
  }
  const configHome = process.env.XDG_CONFIG_HOME ?? path.join(os.homedir(), ".config");
  return path.join(configHome, appName);
}
