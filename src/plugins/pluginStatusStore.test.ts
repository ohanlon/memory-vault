import { afterEach, describe, expect, it, vi } from "vitest";
import { clearPluginStatus, getPluginStatus, setPluginStatus, subscribePluginStatus } from "./pluginStatusStore";

describe("pluginStatusStore", () => {
  afterEach(() => {
    clearPluginStatus("p1");
    clearPluginStatus("p2");
  });

  it("returns undefined for a plugin with no status set", () => {
    expect(getPluginStatus("p1")).toBeUndefined();
  });

  it("stores and retrieves status text per plugin id", () => {
    setPluginStatus("p1", "Syncing...");
    setPluginStatus("p2", "Idle");
    expect(getPluginStatus("p1")).toBe("Syncing...");
    expect(getPluginStatus("p2")).toBe("Idle");
  });

  it("overwrites a plugin's previous status", () => {
    setPluginStatus("p1", "Syncing...");
    setPluginStatus("p1", "Done");
    expect(getPluginStatus("p1")).toBe("Done");
  });

  it("notifies subscribers on every set", () => {
    const listener = vi.fn();
    const unsubscribe = subscribePluginStatus(listener);
    setPluginStatus("p1", "A");
    setPluginStatus("p1", "B");
    expect(listener).toHaveBeenCalledTimes(2);
    unsubscribe();
  });

  it("stops notifying after unsubscribe", () => {
    const listener = vi.fn();
    const unsubscribe = subscribePluginStatus(listener);
    unsubscribe();
    setPluginStatus("p1", "A");
    expect(listener).not.toHaveBeenCalled();
  });

  it("clears a plugin's status", () => {
    setPluginStatus("p1", "A");
    clearPluginStatus("p1");
    expect(getPluginStatus("p1")).toBeUndefined();
  });
});
