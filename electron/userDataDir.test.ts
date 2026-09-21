import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cairnUserDataDir } from "./userDataDir";

const originalPlatform = process.platform;
const originalAppData = process.env.APPDATA;
const originalXdgConfigHome = process.env.XDG_CONFIG_HOME;

function setPlatform(platform: NodeJS.Platform): void {
  Object.defineProperty(process, "platform", { value: platform });
}

afterEach(() => {
  setPlatform(originalPlatform);
  process.env.APPDATA = originalAppData;
  process.env.XDG_CONFIG_HOME = originalXdgConfigHome;
  vi.unstubAllEnvs();
});

describe("cairnUserDataDir", () => {
  it("uses %APPDATA%/cairn on Windows", () => {
    setPlatform("win32");
    process.env.APPDATA = "C:\\Users\\test\\AppData\\Roaming";
    expect(cairnUserDataDir()).toBe(path.join("C:\\Users\\test\\AppData\\Roaming", "cairn"));
  });

  it("uses ~/Library/Application Support/cairn on macOS", () => {
    setPlatform("darwin");
    expect(cairnUserDataDir()).toBe(path.join(require("node:os").homedir(), "Library", "Application Support", "cairn"));
  });

  it("uses $XDG_CONFIG_HOME/cairn on Linux when set", () => {
    setPlatform("linux");
    process.env.XDG_CONFIG_HOME = "/home/test/.config";
    expect(cairnUserDataDir()).toBe(path.join("/home/test/.config", "cairn"));
  });

  it("falls back to ~/.config/cairn on Linux when XDG_CONFIG_HOME is unset", () => {
    setPlatform("linux");
    delete process.env.XDG_CONFIG_HOME;
    expect(cairnUserDataDir()).toBe(path.join(require("node:os").homedir(), ".config", "cairn"));
  });
});
