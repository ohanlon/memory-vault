import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { readAppSettingsFile, writeAppSettingsFile } from "./appSettings";
import { DEFAULT_APP_SETTINGS } from "../shared/appSettings";

describe("readAppSettingsFile / writeAppSettingsFile", () => {
  const tmpFile = path.join(os.tmpdir(), `app-settings-test-${process.pid}.json`);

  afterEach(() => {
    fs.rmSync(tmpFile, { force: true });
  });

  it("returns defaults when the file does not exist", () => {
    expect(readAppSettingsFile(tmpFile)).toEqual(DEFAULT_APP_SETTINGS);
  });

  it("creates the parent directory on first write", () => {
    const nested = path.join(os.tmpdir(), `app-settings-test-dir-${process.pid}`, "settings.json");
    expect(fs.existsSync(path.dirname(nested))).toBe(false);
    writeAppSettingsFile(nested, { ...DEFAULT_APP_SETTINGS, tabFolderDisplay: "always" });
    expect(fs.existsSync(nested)).toBe(true);
    fs.rmSync(path.dirname(nested), { recursive: true, force: true });
  });

  it("round-trips settings through disk", () => {
    const settings = {
      tabFolderDisplay: "never" as const,
      dailyNotesFolder: "Journal",
      theme: "light" as const,
      addHeadingToNewNotes: false,
      hidePropertiesByDefault: false,
      showLineNumbers: false,
      editorFontFamily: "monospace" as const,
      editorFontSize: 18,
    };
    writeAppSettingsFile(tmpFile, settings);
    expect(readAppSettingsFile(tmpFile)).toEqual(settings);
  });

  it("returns defaults for corrupt JSON instead of throwing", () => {
    fs.writeFileSync(tmpFile, "{not valid json", "utf-8");
    expect(readAppSettingsFile(tmpFile)).toEqual(DEFAULT_APP_SETTINGS);
  });
});
