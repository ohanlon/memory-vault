import { pluginRegistry } from "./registry";
import { ActivityBar } from "../components/ActivityBar";
import { TitleBarChrome } from "../components/TitleBarChrome";
import { FileTreePanel } from "../components/FileTreePanel";
import { EditorPane } from "../components/EditorPane";
import { GraphPanel } from "../components/GraphPanel";
import { LinksPanel } from "../components/LinksPanel";
import { TagsPanel } from "../components/TagsPanel";
import { PropertiesPanel } from "../components/PropertiesPanel";
import { SettingsView } from "../components/SettingsView";
import { BacklinksStat, CharactersStat, PropertiesStat, WordsStat } from "../components/StatusItems";
import { GRAPH_TAB_ID, SETTINGS_TAB_ID } from "../vault/tabs";

// The app's built-in functionality, expressed as a plugin against the same
// API a future third-party plugin would use.
export function registerCorePlugin(): void {
  pluginRegistry.registerRegion("title-bar", TitleBarChrome);
  pluginRegistry.registerRegion("left-ribbon", ActivityBar);

  pluginRegistry.registerView({ id: "files", region: "left-sidebar", title: "Files", component: FileTreePanel });

  pluginRegistry.registerView({ id: "links", region: "right-sidebar", title: "Links", component: LinksPanel });
  pluginRegistry.registerView({ id: "tags", region: "right-sidebar", title: "Tags", component: TagsPanel });
  pluginRegistry.registerView({
    id: "properties",
    region: "right-sidebar",
    title: "Properties",
    component: PropertiesPanel,
  });

  pluginRegistry.registerTabKind({ id: "graph", matches: (tabId) => tabId === GRAPH_TAB_ID, component: GraphPanel });
  pluginRegistry.registerTabKind({
    id: "settings",
    matches: (tabId) => tabId === SETTINGS_TAB_ID,
    component: SettingsView,
  });
  pluginRegistry.registerTabKind({
    id: "note",
    matches: (tabId) => tabId !== GRAPH_TAB_ID && tabId !== SETTINGS_TAB_ID,
    component: EditorPane,
  });

  pluginRegistry.registerStatusItem({ id: "backlinks", component: BacklinksStat });
  pluginRegistry.registerStatusItem({ id: "properties", component: PropertiesStat });
  pluginRegistry.registerStatusItem({ id: "words", component: WordsStat });
  pluginRegistry.registerStatusItem({ id: "characters", component: CharactersStat });
}
