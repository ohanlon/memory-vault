import { describe, expect, it, vi } from "vitest";
import { hasLivePluginFrame, pushToPlugin, registerPluginFrame, unregisterPluginFrame } from "./pluginFrameRegistry";

function fakeWindow(): Window {
  return { postMessage: vi.fn() } as unknown as Window;
}

describe("pluginFrameRegistry", () => {
  it("reports no live frame for an unregistered plugin", () => {
    expect(hasLivePluginFrame("unknown")).toBe(false);
  });

  it("reports a live frame once registered", () => {
    const win = fakeWindow();
    registerPluginFrame("p1", win);
    expect(hasLivePluginFrame("p1")).toBe(true);
    unregisterPluginFrame("p1", win);
  });

  it("stops reporting a live frame after unregister", () => {
    const win = fakeWindow();
    registerPluginFrame("p1", win);
    unregisterPluginFrame("p1", win);
    expect(hasLivePluginFrame("p1")).toBe(false);
  });

  it("does not unregister if a different window instance is passed", () => {
    const winA = fakeWindow();
    const winB = fakeWindow();
    registerPluginFrame("p1", winA);
    unregisterPluginFrame("p1", winB);
    expect(hasLivePluginFrame("p1")).toBe(true);
    unregisterPluginFrame("p1", winA);
  });

  it("pushes a message to the registered window and returns true", () => {
    const win = fakeWindow();
    registerPluginFrame("p1", win);
    const message = {
      channel: "cairn-plugin-rpc" as const,
      kind: "push" as const,
      event: "contextMenuAction" as const,
      itemId: "do-thing",
      targetPath: "a.md",
    };
    expect(pushToPlugin("p1", message)).toBe(true);
    expect(win.postMessage).toHaveBeenCalledWith(message, "*");
    unregisterPluginFrame("p1", win);
  });

  it("returns false when pushing to a plugin with no live frame", () => {
    const message = {
      channel: "cairn-plugin-rpc" as const,
      kind: "push" as const,
      event: "contextMenuAction" as const,
      itemId: "do-thing",
      targetPath: "a.md",
    };
    expect(pushToPlugin("unknown", message)).toBe(false);
  });
});
