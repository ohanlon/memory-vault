import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { discoverPlugins } from "./pluginRegistry";

describe("discoverPlugins", () => {
  const tmpRoot = path.join(os.tmpdir(), `plugin-discovery-test-${process.pid}`);
  const pluginsDir = path.join(tmpRoot, "plugins");

  afterEach(() => {
    fs.rmSync(tmpRoot, { force: true, recursive: true });
  });

  function writeManifest(id: string, manifest: unknown) {
    const dir = path.join(pluginsDir, id);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "manifest.json"), JSON.stringify(manifest), "utf-8");
    return dir;
  }

  it("returns an empty array when the plugins folder does not exist", () => {
    expect(discoverPlugins(pluginsDir)).toEqual([]);
  });

  it("discovers a valid manifest", () => {
    const dir = writeManifest("hello", {
      id: "hello",
      name: "Hello",
      version: "1.0.0",
      main: "index.js",
      permissions: [],
    });
    const result = discoverPlugins(pluginsDir);
    expect(result).toEqual([
      { manifest: { id: "hello", name: "Hello", version: "1.0.0", main: "index.js", permissions: [] }, dir },
    ]);
  });

  it("discovers declared permissions", () => {
    writeManifest("net-plugin", {
      id: "net-plugin",
      name: "Net Plugin",
      version: "0.1.0",
      main: "index.js",
      permissions: ["network", "shell:openExternal"],
    });
    const result = discoverPlugins(pluginsDir);
    expect(result[0].manifest.permissions).toEqual(["network", "shell:openExternal"]);
  });

  it("skips a folder with no manifest.json", () => {
    fs.mkdirSync(path.join(pluginsDir, "empty"), { recursive: true });
    expect(discoverPlugins(pluginsDir)).toEqual([]);
  });

  it("skips corrupt JSON instead of throwing", () => {
    const dir = path.join(pluginsDir, "broken");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "manifest.json"), "{not valid json", "utf-8");
    expect(discoverPlugins(pluginsDir)).toEqual([]);
  });

  it("skips a manifest missing required fields", () => {
    writeManifest("incomplete", { id: "incomplete", name: "Incomplete" });
    expect(discoverPlugins(pluginsDir)).toEqual([]);
  });

  it("skips a manifest declaring an unknown permission", () => {
    writeManifest("bad-perm", {
      id: "bad-perm",
      name: "Bad Perm",
      version: "1.0.0",
      main: "index.js",
      permissions: ["filesystem:all"],
    });
    expect(discoverPlugins(pluginsDir)).toEqual([]);
  });

  it("discovers multiple plugins", () => {
    writeManifest("a", { id: "a", name: "A", version: "1.0.0", main: "index.js", permissions: [] });
    writeManifest("b", { id: "b", name: "B", version: "1.0.0", main: "index.js", permissions: [] });
    expect(discoverPlugins(pluginsDir)).toHaveLength(2);
  });

  it("discovers a manifest declaring sidebar views", () => {
    writeManifest("with-view", {
      id: "with-view",
      name: "With View",
      version: "1.0.0",
      main: "index.html",
      permissions: [],
      views: [{ id: "main", title: "My View", region: "left-sidebar", entry: "index.html" }],
    });
    const result = discoverPlugins(pluginsDir);
    expect(result[0].manifest.views).toEqual([
      { id: "main", title: "My View", region: "left-sidebar", entry: "index.html" },
    ]);
  });

  it("skips a manifest with a view in an unknown region", () => {
    writeManifest("bad-view", {
      id: "bad-view",
      name: "Bad View",
      version: "1.0.0",
      main: "index.html",
      permissions: [],
      views: [{ id: "main", title: "My View", region: "editor", entry: "index.html" }],
    });
    expect(discoverPlugins(pluginsDir)).toEqual([]);
  });

  it("skips a manifest with a malformed view entry", () => {
    writeManifest("malformed-view", {
      id: "malformed-view",
      name: "Malformed View",
      version: "1.0.0",
      main: "index.html",
      permissions: [],
      views: [{ id: "main" }],
    });
    expect(discoverPlugins(pluginsDir)).toEqual([]);
  });

  it("discovers a manifest declaring a ribbon item that opens a declared view", () => {
    writeManifest("with-ribbon", {
      id: "with-ribbon",
      name: "With Ribbon",
      version: "1.0.0",
      main: "index.html",
      permissions: [],
      views: [{ id: "main", title: "My View", region: "left-sidebar", entry: "index.html" }],
      ribbonItems: [{ id: "launch", title: "Launch", icon: "M0 0L1 1", opensView: "main" }],
    });
    const result = discoverPlugins(pluginsDir);
    expect(result[0].manifest.ribbonItems).toEqual([
      { id: "launch", title: "Launch", icon: "M0 0L1 1", opensView: "main" },
    ]);
  });

  it("skips a manifest whose ribbon item references a view that doesn't exist", () => {
    writeManifest("dangling-ribbon", {
      id: "dangling-ribbon",
      name: "Dangling Ribbon",
      version: "1.0.0",
      main: "index.html",
      permissions: [],
      views: [{ id: "main", title: "My View", region: "left-sidebar", entry: "index.html" }],
      ribbonItems: [{ id: "launch", title: "Launch", icon: "M0 0L1 1", opensView: "missing" }],
    });
    expect(discoverPlugins(pluginsDir)).toEqual([]);
  });

  it("skips a manifest with a malformed ribbon item", () => {
    writeManifest("malformed-ribbon", {
      id: "malformed-ribbon",
      name: "Malformed Ribbon",
      version: "1.0.0",
      main: "index.html",
      permissions: [],
      ribbonItems: [{ id: "launch" }],
    });
    expect(discoverPlugins(pluginsDir)).toEqual([]);
  });

  it("discovers a manifest declaring an editor tab", () => {
    writeManifest("with-tab", {
      id: "with-tab",
      name: "With Tab",
      version: "1.0.0",
      main: "index.html",
      permissions: [],
      tabs: [{ id: "main", title: "My Tab", entry: "tab.html" }],
    });
    const result = discoverPlugins(pluginsDir);
    expect(result[0].manifest.tabs).toEqual([{ id: "main", title: "My Tab", entry: "tab.html" }]);
  });

  it("skips a manifest with a malformed tab entry", () => {
    writeManifest("malformed-tab", {
      id: "malformed-tab",
      name: "Malformed Tab",
      version: "1.0.0",
      main: "index.html",
      permissions: [],
      tabs: [{ id: "main" }],
    });
    expect(discoverPlugins(pluginsDir)).toEqual([]);
  });

  it("discovers a ribbon item that opens a declared tab", () => {
    writeManifest("with-tab-ribbon", {
      id: "with-tab-ribbon",
      name: "With Tab Ribbon",
      version: "1.0.0",
      main: "index.html",
      permissions: [],
      tabs: [{ id: "main", title: "My Tab", entry: "tab.html" }],
      ribbonItems: [{ id: "launch", title: "Launch", icon: "M0 0L1 1", opensTab: "main" }],
    });
    const result = discoverPlugins(pluginsDir);
    expect(result[0].manifest.ribbonItems).toEqual([
      { id: "launch", title: "Launch", icon: "M0 0L1 1", opensTab: "main" },
    ]);
  });

  it("skips a manifest whose ribbon item references a tab that doesn't exist", () => {
    writeManifest("dangling-tab-ribbon", {
      id: "dangling-tab-ribbon",
      name: "Dangling Tab Ribbon",
      version: "1.0.0",
      main: "index.html",
      permissions: [],
      tabs: [{ id: "main", title: "My Tab", entry: "tab.html" }],
      ribbonItems: [{ id: "launch", title: "Launch", icon: "M0 0L1 1", opensTab: "missing" }],
    });
    expect(discoverPlugins(pluginsDir)).toEqual([]);
  });

  it("skips a ribbon item declaring both opensView and opensTab", () => {
    writeManifest("ambiguous-ribbon", {
      id: "ambiguous-ribbon",
      name: "Ambiguous Ribbon",
      version: "1.0.0",
      main: "index.html",
      permissions: [],
      views: [{ id: "main", title: "My View", region: "left-sidebar", entry: "index.html" }],
      tabs: [{ id: "main", title: "My Tab", entry: "tab.html" }],
      ribbonItems: [{ id: "launch", title: "Launch", icon: "M0 0L1 1", opensView: "main", opensTab: "main" }],
    });
    expect(discoverPlugins(pluginsDir)).toEqual([]);
  });

  it("skips a ribbon item declaring neither opensView nor opensTab", () => {
    writeManifest("empty-ribbon", {
      id: "empty-ribbon",
      name: "Empty Ribbon",
      version: "1.0.0",
      main: "index.html",
      permissions: [],
      ribbonItems: [{ id: "launch", title: "Launch", icon: "M0 0L1 1" }],
    });
    expect(discoverPlugins(pluginsDir)).toEqual([]);
  });

  it("discovers a manifest declaring context menu items", () => {
    writeManifest("with-menu", {
      id: "with-menu",
      name: "With Menu",
      version: "1.0.0",
      main: "index.html",
      permissions: [],
      contextMenuItems: [
        { id: "note-action", label: "Do a note thing", target: "note" },
        { id: "folder-action", label: "Do a folder thing", target: "folder" },
      ],
    });
    const result = discoverPlugins(pluginsDir);
    expect(result[0].manifest.contextMenuItems).toEqual([
      { id: "note-action", label: "Do a note thing", target: "note" },
      { id: "folder-action", label: "Do a folder thing", target: "folder" },
    ]);
  });

  it("skips a manifest with a context menu item in an unknown target", () => {
    writeManifest("bad-menu-target", {
      id: "bad-menu-target",
      name: "Bad Menu Target",
      version: "1.0.0",
      main: "index.html",
      permissions: [],
      contextMenuItems: [{ id: "action", label: "Do a thing", target: "editor" }],
    });
    expect(discoverPlugins(pluginsDir)).toEqual([]);
  });

  it("skips a manifest with a malformed context menu item", () => {
    writeManifest("malformed-menu", {
      id: "malformed-menu",
      name: "Malformed Menu",
      version: "1.0.0",
      main: "index.html",
      permissions: [],
      contextMenuItems: [{ id: "action" }],
    });
    expect(discoverPlugins(pluginsDir)).toEqual([]);
  });

  it("accepts the git-sync permission and an exclusive view", () => {
    writeManifest("sync", {
      id: "sync",
      name: "Sync",
      version: "1.0.0",
      main: "index.html",
      permissions: ["git-sync"],
      views: [{ id: "v", title: "V", region: "left-sidebar", entry: "index.html", exclusive: true }],
    });
    const [plugin] = discoverPlugins(pluginsDir);
    expect(plugin.manifest.permissions).toEqual(["git-sync"]);
    expect(plugin.manifest.views?.[0].exclusive).toBe(true);
  });

  it("skips a view whose exclusive flag is not a boolean", () => {
    writeManifest("bad-exclusive", {
      id: "bad-exclusive",
      name: "Bad",
      version: "1.0.0",
      main: "index.html",
      permissions: [],
      views: [{ id: "v", title: "V", region: "left-sidebar", entry: "index.html", exclusive: "yes" }],
    });
    expect(discoverPlugins(pluginsDir)).toEqual([]);
  });

  describe("ribbon iconFile", () => {
    const base = {
      id: "icons",
      name: "Icons",
      version: "1.0.0",
      main: "index.html",
      permissions: [],
      views: [{ id: "v", title: "V", region: "left-sidebar", entry: "index.html" }],
    };

    it("inlines an .svg icon file as iconSvg", () => {
      const dir = writeManifest("icons", {
        ...base,
        ribbonItems: [{ id: "r", title: "R", iconFile: "icon.svg", opensView: "v" }],
      });
      fs.writeFileSync(path.join(dir, "icon.svg"), "<svg/>");
      const [plugin] = discoverPlugins(pluginsDir);
      expect(plugin.manifest.ribbonItems?.[0].iconSvg).toBe("<svg/>");
    });

    it("ignores a manifest-supplied iconSvg and drops items left with no icon", () => {
      writeManifest("icons", {
        ...base,
        ribbonItems: [{ id: "r", title: "R", iconFile: "missing.svg", iconSvg: "<svg onload=x/>", opensView: "v" }],
      });
      const [plugin] = discoverPlugins(pluginsDir);
      expect(plugin.manifest.ribbonItems).toEqual([]);
    });

    it("refuses icon files outside the plugin folder and non-svg files", () => {
      const dir = writeManifest("icons", {
        ...base,
        ribbonItems: [
          { id: "a", title: "A", iconFile: "../outside.svg", icon: "M0 0", opensView: "v" },
          { id: "b", title: "B", iconFile: "notes.txt", icon: "M0 0", opensView: "v" },
        ],
      });
      fs.writeFileSync(path.join(path.dirname(dir), "outside.svg"), "<svg/>");
      fs.writeFileSync(path.join(dir, "notes.txt"), "<svg/>");
      const [plugin] = discoverPlugins(pluginsDir);
      expect(plugin.manifest.ribbonItems?.every((r) => r.iconSvg === undefined)).toBe(true);
    });

    it("rejects a ribbon item with neither icon nor iconFile", () => {
      writeManifest("icons", { ...base, ribbonItems: [{ id: "r", title: "R", opensView: "v" }] });
      expect(discoverPlugins(pluginsDir)).toEqual([]);
    });
  });
});
