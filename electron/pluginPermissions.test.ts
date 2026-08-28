import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  grantPermission,
  hasPermission,
  readPluginPermissionsFile,
  revokePermission,
  writePluginPermissionsFile,
  type PluginPermissionsFile,
} from "./pluginPermissions";

describe("readPluginPermissionsFile / writePluginPermissionsFile", () => {
  const tmpFile = path.join(os.tmpdir(), `plugin-permissions-test-${process.pid}.json`);

  afterEach(() => {
    fs.rmSync(tmpFile, { force: true });
  });

  it("returns an empty object when the file does not exist", () => {
    expect(readPluginPermissionsFile(tmpFile)).toEqual({});
  });

  it("round-trips permissions through disk", () => {
    const perms: PluginPermissionsFile = { "my-plugin": { granted: ["network"] } };
    writePluginPermissionsFile(tmpFile, perms);
    expect(readPluginPermissionsFile(tmpFile)).toEqual(perms);
  });

  it("returns an empty object for corrupt JSON instead of throwing", () => {
    fs.writeFileSync(tmpFile, "{not valid json", "utf-8");
    expect(readPluginPermissionsFile(tmpFile)).toEqual({});
  });

  it("filters out malformed entries", () => {
    fs.writeFileSync(
      tmpFile,
      JSON.stringify({ good: { granted: ["network"] }, bad: { granted: "not-an-array" } }),
      "utf-8"
    );
    expect(readPluginPermissionsFile(tmpFile)).toEqual({ good: { granted: ["network"] } });
  });
});

describe("hasPermission", () => {
  it("returns false for a plugin with no recorded state", () => {
    expect(hasPermission({}, "unknown", "network")).toBe(false);
  });

  it("returns true when the permission is granted", () => {
    const perms: PluginPermissionsFile = { p: { granted: ["network"] } };
    expect(hasPermission(perms, "p", "network")).toBe(true);
  });

  it("returns false when a different permission is granted", () => {
    const perms: PluginPermissionsFile = { p: { granted: ["shell:openExternal"] } };
    expect(hasPermission(perms, "p", "network")).toBe(false);
  });
});

describe("grantPermission", () => {
  it("adds a permission for a plugin with no prior state", () => {
    const result = grantPermission({}, "p", "network");
    expect(result).toEqual({ p: { granted: ["network"] } });
  });

  it("is idempotent", () => {
    const perms: PluginPermissionsFile = { p: { granted: ["network"] } };
    expect(grantPermission(perms, "p", "network")).toBe(perms);
  });

  it("does not mutate the input", () => {
    const perms: PluginPermissionsFile = { p: { granted: [] } };
    grantPermission(perms, "p", "network");
    expect(perms.p.granted).toEqual([]);
  });
});

describe("revokePermission", () => {
  it("removes a granted permission", () => {
    const perms: PluginPermissionsFile = { p: { granted: ["network", "shell:openExternal"] } };
    expect(revokePermission(perms, "p", "network")).toEqual({
      p: { granted: ["shell:openExternal"] },
    });
  });

  it("is a no-op for a plugin with no recorded state", () => {
    expect(revokePermission({}, "unknown", "network")).toEqual({});
  });
});
