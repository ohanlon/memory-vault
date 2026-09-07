import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { discoverPlugins } from "./pluginRegistry";

describe("discoverPlugins", () => {
  const tmpRoot = path.join(os.tmpdir(), `plugin-discovery-test-${process.pid}`);

  afterEach(() => {
    fs.rmSync(tmpRoot, { force: true, recursive: true });
  });

  function writeManifest(id: string, manifest: unknown) {
    const dir = path.join(tmpRoot, ".cairn", "plugins", id);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "manifest.json"), JSON.stringify(manifest), "utf-8");
    return dir;
  }

  it("returns an empty array when the plugins folder does not exist", () => {
    expect(discoverPlugins(tmpRoot)).toEqual([]);
  });

  it("discovers a valid manifest", () => {
    const dir = writeManifest("hello", {
      id: "hello",
      name: "Hello",
      version: "1.0.0",
      main: "index.js",
      permissions: [],
    });
    const result = discoverPlugins(tmpRoot);
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
    const result = discoverPlugins(tmpRoot);
    expect(result[0].manifest.permissions).toEqual(["network", "shell:openExternal"]);
  });

  it("skips a folder with no manifest.json", () => {
    fs.mkdirSync(path.join(tmpRoot, ".cairn", "plugins", "empty"), { recursive: true });
    expect(discoverPlugins(tmpRoot)).toEqual([]);
  });

  it("skips corrupt JSON instead of throwing", () => {
    const dir = path.join(tmpRoot, ".cairn", "plugins", "broken");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "manifest.json"), "{not valid json", "utf-8");
    expect(discoverPlugins(tmpRoot)).toEqual([]);
  });

  it("skips a manifest missing required fields", () => {
    writeManifest("incomplete", { id: "incomplete", name: "Incomplete" });
    expect(discoverPlugins(tmpRoot)).toEqual([]);
  });

  it("skips a manifest declaring an unknown permission", () => {
    writeManifest("bad-perm", {
      id: "bad-perm",
      name: "Bad Perm",
      version: "1.0.0",
      main: "index.js",
      permissions: ["filesystem:all"],
    });
    expect(discoverPlugins(tmpRoot)).toEqual([]);
  });

  it("discovers multiple plugins", () => {
    writeManifest("a", { id: "a", name: "A", version: "1.0.0", main: "index.js", permissions: [] });
    writeManifest("b", { id: "b", name: "B", version: "1.0.0", main: "index.js", permissions: [] });
    expect(discoverPlugins(tmpRoot)).toHaveLength(2);
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
    const result = discoverPlugins(tmpRoot);
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
    expect(discoverPlugins(tmpRoot)).toEqual([]);
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
    expect(discoverPlugins(tmpRoot)).toEqual([]);
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
    const result = discoverPlugins(tmpRoot);
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
    expect(discoverPlugins(tmpRoot)).toEqual([]);
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
    expect(discoverPlugins(tmpRoot)).toEqual([]);
  });
});
