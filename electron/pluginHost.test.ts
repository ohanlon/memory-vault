import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const createdWindows: FakeBrowserWindow[] = [];
let nextWebContentsId = 1;

class FakeWebContents {
  id = nextWebContentsId++;
  windowOpenHandler: ((details: { url: string }) => { action: string }) | null = null;
  navigateListeners: Array<(event: { preventDefault: () => void }, url: string) => void> = [];
  session = {
    webRequest: {
      onBeforeRequest: vi.fn(),
    },
  };
  setWindowOpenHandler(handler: (details: { url: string }) => { action: string }) {
    this.windowOpenHandler = handler;
  }
  on(event: string, listener: (...args: never[]) => void) {
    if (event === "will-navigate") this.navigateListeners.push(listener as never);
  }
}

class FakeBrowserWindow {
  webPreferences: Record<string, unknown>;
  webContents = new FakeWebContents();
  loadFileArgs: string[] = [];
  closedListeners: Array<() => void> = [];
  constructor(options: { webPreferences: Record<string, unknown> }) {
    this.webPreferences = options.webPreferences;
    createdWindows.push(this);
  }
  loadFile(filePath: string) {
    this.loadFileArgs.push(filePath);
  }
  on(event: string, listener: () => void) {
    if (event === "closed") this.closedListeners.push(listener);
  }
}

vi.mock("electron", () => ({ BrowserWindow: FakeBrowserWindow }));

const { createPluginWindow, pluginIdForWebContents, pluginPartition } = await import("./pluginHost");
const { discoverPlugins } = await import("./pluginRegistry");
const { writePluginPermissionsFile } = await import("./pluginPermissions");
type DiscoveredPlugin = Awaited<ReturnType<typeof discoverPlugins>>[number];

describe("pluginPartition", () => {
  it("namespaces a plugin id into a persistent session partition", () => {
    expect(pluginPartition("hello")).toBe("persist:plugin:hello");
  });
});

describe("createPluginWindow", () => {
  const permissionsFile = path.join(os.tmpdir(), `plugin-host-test-${process.pid}.json`);

  afterEach(() => {
    fs.rmSync(permissionsFile, { force: true });
  });

  const plugin: DiscoveredPlugin = {
    manifest: { id: "hello", name: "Hello", version: "1.0.0", main: "index.html", permissions: [] },
    dir: path.join("stack", ".cairn", "plugins", "hello"),
  };

  it("creates a window that is isolated, non-Node-integrated, and sandboxed", () => {
    createPluginWindow(plugin as never, permissionsFile);
    const win = createdWindows[createdWindows.length - 1];
    expect(win.webPreferences.contextIsolation).toBe(true);
    expect(win.webPreferences.nodeIntegration).toBe(false);
    expect(win.webPreferences.sandbox).toBe(true);
  });

  it("scopes the window to a per-plugin session partition", () => {
    createPluginWindow(plugin as never, permissionsFile);
    const win = createdWindows[createdWindows.length - 1];
    expect(win.webPreferences.partition).toBe("persist:plugin:hello");
  });

  it("passes the plugin's id and name via additionalArguments for the preload bridge", () => {
    createPluginWindow(plugin as never, permissionsFile);
    const win = createdWindows[createdWindows.length - 1];
    expect(win.webPreferences.additionalArguments).toEqual([
      "--cairn-plugin-id=hello",
      "--cairn-plugin-name=Hello",
    ]);
  });

  it("loads the plugin's declared main entry from its own folder", () => {
    createPluginWindow(plugin as never, permissionsFile);
    const win = createdWindows[createdWindows.length - 1];
    expect(win.loadFileArgs[0]).toBe(path.join(plugin.dir, plugin.manifest.main));
  });

  it("registers the window's webContents id against the plugin id", () => {
    const win = createPluginWindow(plugin as never, permissionsFile) as unknown as FakeBrowserWindow;
    expect(pluginIdForWebContents(win.webContents.id)).toBe("hello");
  });

  it("denies window-open and navigation to a domain without network permission", () => {
    const win = createPluginWindow(plugin as never, permissionsFile) as unknown as FakeBrowserWindow;
    expect(win.webContents.windowOpenHandler!({ url: "https://example.com" })).toEqual({ action: "deny" });
  });

  it("allows window-open once the plugin holds network permission", () => {
    writePluginPermissionsFile(permissionsFile, { hello: { granted: ["network"] } });
    const win = createPluginWindow(plugin as never, permissionsFile) as unknown as FakeBrowserWindow;
    expect(win.webContents.windowOpenHandler!({ url: "https://example.com" })).toEqual({ action: "allow" });
  });

  it("prevents navigation to a disallowed domain via will-navigate", () => {
    const win = createPluginWindow(plugin as never, permissionsFile) as unknown as FakeBrowserWindow;
    let prevented = false;
    win.webContents.navigateListeners[0]({ preventDefault: () => (prevented = true) }, "https://example.com");
    expect(prevented).toBe(true);
  });

  it("attaches a webRequest.onBeforeRequest handler scoped to this window's session", () => {
    const win = createPluginWindow(plugin as never, permissionsFile) as unknown as FakeBrowserWindow;
    expect(win.webContents.session.webRequest.onBeforeRequest).toHaveBeenCalledTimes(1);
  });
});
