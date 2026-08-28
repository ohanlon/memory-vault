import type { ComponentType } from "react";
import type {
  CommandHandler,
  SingleSlotRegion,
  StatusItemContribution,
  TabbedRegionName,
  TabKindContribution,
  ViewContribution,
} from "./types";

// Single process-wide registry. The core app registers through it as a
// statically imported module (see plugins/core.tsx); third-party plugins
// discovered under a stack's .cairn/plugins folder (see
// src/plugins/loader.ts) register through the same API at runtime, tagged
// with their plugin id so their contributions can be torn down with
// unregisterPlugin when the stack changes.
class PluginRegistry {
  private regions = new Map<SingleSlotRegion, ComponentType<any>>();
  private regionOwners = new Map<SingleSlotRegion, string>();
  private views: (ViewContribution & { pluginId?: string })[] = [];
  private tabKinds: (TabKindContribution & { pluginId?: string })[] = [];
  private statusItems: (StatusItemContribution & { pluginId?: string })[] = [];
  private commands = new Map<string, { handler: CommandHandler; pluginId?: string }>();

  registerRegion(region: SingleSlotRegion, component: ComponentType<any>, pluginId?: string): void {
    this.regions.set(region, component);
    if (pluginId) this.regionOwners.set(region, pluginId);
    else this.regionOwners.delete(region);
  }

  getRegion(region: SingleSlotRegion): ComponentType<any> | undefined {
    return this.regions.get(region);
  }

  registerView(view: ViewContribution, pluginId?: string): void {
    this.views.push({ ...view, pluginId });
  }

  getViews(region: TabbedRegionName): ViewContribution[] {
    return this.views.filter((v) => v.region === region);
  }

  registerTabKind(kind: TabKindContribution, pluginId?: string): void {
    this.tabKinds.push({ ...kind, pluginId });
  }

  getTabKind(tabId: string | null): TabKindContribution | undefined {
    return this.tabKinds.find((k) => k.matches(tabId));
  }

  registerStatusItem(item: StatusItemContribution, pluginId?: string): void {
    this.statusItems.push({ ...item, pluginId });
  }

  getStatusItems(): StatusItemContribution[] {
    return this.statusItems;
  }

  registerCommand(id: string, handler: CommandHandler, pluginId?: string): void {
    this.commands.set(id, { handler, pluginId });
  }

  runCommand(id: string, ...args: unknown[]): void {
    const entry = this.commands.get(id);
    if (!entry) {
      console.warn(`No command registered for "${id}"`);
      return;
    }
    entry.handler(...args);
  }

  // Removes every contribution tagged with this plugin id — called when a
  // plugin's stack is unloaded or its window is torn down.
  unregisterPlugin(pluginId: string): void {
    for (const [region, owner] of this.regionOwners) {
      if (owner === pluginId) {
        this.regions.delete(region);
        this.regionOwners.delete(region);
      }
    }
    this.views = this.views.filter((v) => v.pluginId !== pluginId);
    this.tabKinds = this.tabKinds.filter((k) => k.pluginId !== pluginId);
    this.statusItems = this.statusItems.filter((s) => s.pluginId !== pluginId);
    for (const [id, entry] of this.commands) {
      if (entry.pluginId === pluginId) this.commands.delete(id);
    }
  }
}

export const pluginRegistry = new PluginRegistry();
