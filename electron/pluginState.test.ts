import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { isPluginEnabled, readPluginStateFile, setPluginEnabled, writePluginStateFile } from "./pluginState";

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

describe("pluginState", () => {
  it("treats a plugin with no entry as enabled", () => {
    expect(isPluginEnabled({}, "x")).toBe(true);
    expect(isPluginEnabled({ x: { enabled: false } }, "x")).toBe(false);
  });

  it("sets state immutably", () => {
    const a = {};
    const b = setPluginEnabled(a, "x", false);
    expect(a).toEqual({});
    expect(b).toEqual({ x: { enabled: false } });
    expect(setPluginEnabled(b, "x", true)).toEqual({ x: { enabled: true } });
  });

  it("round-trips and tolerates missing, corrupt and malformed files", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pstate-"));
    dirs.push(dir);
    const file = path.join(dir, "plugin-state.json");
    expect(readPluginStateFile(file)).toEqual({});
    writePluginStateFile(file, { a: { enabled: false } });
    expect(readPluginStateFile(file)).toEqual({ a: { enabled: false } });
    fs.writeFileSync(file, JSON.stringify({ a: { enabled: false }, b: { enabled: "yes" }, c: 3 }));
    expect(readPluginStateFile(file)).toEqual({ a: { enabled: false } });
    fs.writeFileSync(file, "{nope");
    expect(readPluginStateFile(file)).toEqual({});
  });
});
