import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { readLayoutPrefsFile, writeLayoutPrefsFile } from "./layoutPrefs";
import { DEFAULT_LAYOUT_PREFS } from "../shared/layoutPrefs";

describe("readLayoutPrefsFile / writeLayoutPrefsFile", () => {
  const tmpFile = path.join(os.tmpdir(), `layout-prefs-test-${process.pid}.json`);

  afterEach(() => {
    fs.rmSync(tmpFile, { force: true });
  });

  it("returns defaults when the file does not exist", () => {
    expect(readLayoutPrefsFile(tmpFile)).toEqual(DEFAULT_LAYOUT_PREFS);
  });

  it("creates the parent directory on first write", () => {
    const nested = path.join(os.tmpdir(), `layout-prefs-test-dir-${process.pid}`, "layout-prefs.json");
    expect(fs.existsSync(path.dirname(nested))).toBe(false);
    writeLayoutPrefsFile(nested, { sidebarWidth: 300, rightPanelWidth: 400 });
    expect(fs.existsSync(nested)).toBe(true);
    fs.rmSync(path.dirname(nested), { recursive: true, force: true });
  });

  it("round-trips prefs through disk", () => {
    const prefs = { sidebarWidth: 300, rightPanelWidth: 400 };
    writeLayoutPrefsFile(tmpFile, prefs);
    expect(readLayoutPrefsFile(tmpFile)).toEqual(prefs);
  });

  it("returns defaults for corrupt JSON instead of throwing", () => {
    fs.writeFileSync(tmpFile, "{not valid json", "utf-8");
    expect(readLayoutPrefsFile(tmpFile)).toEqual(DEFAULT_LAYOUT_PREFS);
  });

  it("clamps out-of-range values on write", () => {
    writeLayoutPrefsFile(tmpFile, { sidebarWidth: 5, rightPanelWidth: 99999 });
    const result = readLayoutPrefsFile(tmpFile);
    expect(result.sidebarWidth).toBeGreaterThanOrEqual(180);
    expect(result.rightPanelWidth).toBeLessThanOrEqual(560);
  });
});
