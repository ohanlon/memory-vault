import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { isNewerVersion, seedBundledPlugins } from "./bundledPlugins";

const dirs: string[] = [];
function tmp(): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "bundled-"));
  dirs.push(d);
  return d;
}
afterEach(() => {
  for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

function writePlugin(root: string, id: string, version: string, file = "a") {
  const dir = path.join(root, id);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "manifest.json"), JSON.stringify({ id, version }));
  fs.writeFileSync(path.join(dir, "index.html"), file);
}

describe("isNewerVersion", () => {
  it("compares numerically", () => {
    expect(isNewerVersion("1.10.0", "1.9.0")).toBe(true);
    expect(isNewerVersion("1.0.0", "1.0.0")).toBe(false);
    expect(isNewerVersion("1.0", "1.0.1")).toBe(false);
  });
});

describe("seedBundledPlugins", () => {
  it("installs a new plugin as disabled", () => {
    const bundled = tmp();
    const plugins = tmp();
    writePlugin(bundled, "p", "1.0.0");
    const state = seedBundledPlugins(bundled, plugins, {});
    expect(fs.existsSync(path.join(plugins, "p", "index.html"))).toBe(true);
    expect(state).toEqual({ p: { enabled: false } });
  });

  it("leaves an up-to-date install and the user's choice alone", () => {
    const bundled = tmp();
    const plugins = tmp();
    writePlugin(bundled, "p", "1.0.0");
    writePlugin(plugins, "p", "1.0.0", "user-edit");
    const state = seedBundledPlugins(bundled, plugins, { p: { enabled: true } });
    expect(fs.readFileSync(path.join(plugins, "p", "index.html"), "utf-8")).toBe("user-edit");
    expect(state).toEqual({ p: { enabled: true } });
  });

  it("overwrites files on a version bump but keeps the enabled state", () => {
    const bundled = tmp();
    const plugins = tmp();
    writePlugin(bundled, "p", "1.1.0", "new");
    writePlugin(plugins, "p", "1.0.0", "old");
    const state = seedBundledPlugins(bundled, plugins, { p: { enabled: true } });
    expect(fs.readFileSync(path.join(plugins, "p", "index.html"), "utf-8")).toBe("new");
    expect(state).toEqual({ p: { enabled: true } });
  });

  it("tolerates a missing bundled directory", () => {
    expect(seedBundledPlugins(path.join(tmp(), "none"), tmp(), { a: { enabled: true } })).toEqual({ a: { enabled: true } });
  });
});
