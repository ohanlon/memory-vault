import { describe, expect, it, beforeEach } from "vitest";
import { pluginRegistry } from "./registry";

function DummyComponent() {
  return null;
}

describe("PluginRegistry.unregisterPlugin", () => {
  beforeEach(() => {
    pluginRegistry.unregisterPlugin("core");
    pluginRegistry.unregisterPlugin("test-plugin");
    pluginRegistry.unregisterPlugin("other-plugin");
  });

  it("removes a region owned by the plugin", () => {
    pluginRegistry.registerRegion("left-ribbon", DummyComponent, "test-plugin");
    expect(pluginRegistry.getRegion("left-ribbon")).toBe(DummyComponent);
    pluginRegistry.unregisterPlugin("test-plugin");
    expect(pluginRegistry.getRegion("left-ribbon")).toBeUndefined();
  });

  it("leaves a region owned by a different plugin untouched", () => {
    pluginRegistry.registerRegion("left-ribbon", DummyComponent, "other-plugin");
    pluginRegistry.unregisterPlugin("test-plugin");
    expect(pluginRegistry.getRegion("left-ribbon")).toBe(DummyComponent);
    pluginRegistry.unregisterPlugin("other-plugin");
  });

  it("removes views registered by the plugin", () => {
    pluginRegistry.registerView(
      { id: "v1", region: "left-sidebar", title: "V1", component: DummyComponent },
      "test-plugin"
    );
    expect(pluginRegistry.getViews("left-sidebar").map((v) => v.id)).toContain("v1");
    pluginRegistry.unregisterPlugin("test-plugin");
    expect(pluginRegistry.getViews("left-sidebar").map((v) => v.id)).not.toContain("v1");
  });

  it("removes tab kinds registered by the plugin", () => {
    pluginRegistry.registerTabKind({ id: "t1", matches: () => true, component: DummyComponent }, "test-plugin");
    expect(pluginRegistry.getTabKind("anything")?.id).toBe("t1");
    pluginRegistry.unregisterPlugin("test-plugin");
    expect(pluginRegistry.getTabKind("anything")).toBeUndefined();
  });

  it("removes status items registered by the plugin", () => {
    pluginRegistry.registerStatusItem({ id: "s1", component: DummyComponent }, "test-plugin");
    expect(pluginRegistry.getStatusItems().map((s) => s.id)).toContain("s1");
    pluginRegistry.unregisterPlugin("test-plugin");
    expect(pluginRegistry.getStatusItems().map((s) => s.id)).not.toContain("s1");
  });

  it("removes commands registered by the plugin", () => {
    let ran = false;
    pluginRegistry.registerCommand("cmd1", () => (ran = true), "test-plugin");
    pluginRegistry.unregisterPlugin("test-plugin");
    pluginRegistry.runCommand("cmd1");
    expect(ran).toBe(false);
  });

  it("does not remove a command with no pluginId (core registrations)", () => {
    let ran = false;
    pluginRegistry.registerCommand("core-cmd", () => (ran = true));
    pluginRegistry.unregisterPlugin("test-plugin");
    pluginRegistry.runCommand("core-cmd");
    expect(ran).toBe(true);
  });
});
