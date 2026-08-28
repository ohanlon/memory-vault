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
});
