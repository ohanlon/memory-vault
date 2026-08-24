import type { ComponentType } from "react";
import type {
  CommandHandler,
  SingleSlotRegion,
  StatusItemContribution,
  TabbedRegionName,
  TabKindContribution,
  ViewContribution,
} from "./types";

// Single process-wide registry — plugins are statically imported modules
// (see plugins/core.tsx), not dynamically loaded/sandboxed code, so there's
// exactly one instance for the app's lifetime.
class PluginRegistry {
  private regions = new Map<SingleSlotRegion, ComponentType<any>>();
  private views: ViewContribution[] = [];
  private tabKinds: TabKindContribution[] = [];
  private statusItems: StatusItemContribution[] = [];
  private commands = new Map<string, CommandHandler>();

  registerRegion(region: SingleSlotRegion, component: ComponentType<any>): void {
    this.regions.set(region, component);
  }

  getRegion(region: SingleSlotRegion): ComponentType<any> | undefined {
    return this.regions.get(region);
  }

  registerView(view: ViewContribution): void {
    this.views.push(view);
  }

  getViews(region: TabbedRegionName): ViewContribution[] {
    return this.views.filter((v) => v.region === region);
  }

  registerTabKind(kind: TabKindContribution): void {
    this.tabKinds.push(kind);
  }

  getTabKind(tabId: string | null): TabKindContribution | undefined {
    return this.tabKinds.find((k) => k.matches(tabId));
  }

  registerStatusItem(item: StatusItemContribution): void {
    this.statusItems.push(item);
  }

  getStatusItems(): StatusItemContribution[] {
    return this.statusItems;
  }

  registerCommand(id: string, handler: CommandHandler): void {
    this.commands.set(id, handler);
  }

  runCommand(id: string, ...args: unknown[]): void {
    const handler = this.commands.get(id);
    if (!handler) {
      console.warn(`No command registered for "${id}"`);
      return;
    }
    handler(...args);
  }
}

export const pluginRegistry = new PluginRegistry();
