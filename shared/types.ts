export interface WikiLink {
  /** Raw target as written inside [[ ]], before alias/header split.
   *  For an external link, this is the full URL. */
  target: string;
  /** Display alias, e.g. [[Target|Alias]] */
  alias?: string;
  /** Header anchor, e.g. [[Target#Header]] */
  header?: string;
  /** True if target is an external URL (http/https/mailto) rather than a note. */
  external?: boolean;
}

export interface Note {
  /** Absolute path on disk */
  path: string;
  /** File name without extension, used as the link target for wikilinks */
  title: string;
  /** Path relative to the stack root */
  relativePath: string;
  frontmatter: Record<string, unknown>;
  tags: string[];
  links: WikiLink[];
  content: string;
  mtimeMs: number;
}

export interface GraphNode {
  id: string; // note title, a "#tag" id for a tag hub, or a URL for an external node
  path: string;
  tags: string[];
  /** True if this node represents an external URL rather than a stack note. */
  external?: boolean;
  /** True if this node represents a tag hub (id is "#tagname") rather than a note. */
  isTag?: boolean;
}

export interface GraphEdge {
  source: string; // note title
  target: string; // note title, a "#tag" id, or a URL for an external-link edge
  kind: "wikilink" | "tag" | "external-link";
  /** For kind "tag", which tag produced this edge (without the "#" prefix) */
  tag?: string;
}

export interface GraphModel {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface FolderEntry {
  /** Absolute path on disk */
  path: string;
  /** Path relative to the stack root */
  relativePath: string;
}

export interface StackIndex {
  root: string;
  notes: Note[];
  folders: FolderEntry[];
}

export interface StackEntry {
  /** Display name, as typed by the user. Uniqueness is enforced case-insensitively. */
  name: string;
  /** Absolute path to the stack's root folder. */
  root: string;
}

export type FileChangeKind = "add" | "change" | "unlink";

export interface FileChangeEvent {
  kind: FileChangeKind;
  path: string;
}

export type PropertyType = "text" | "list" | "number" | "checkbox" | "date" | "datetime";

export interface PropertyRules {
  /** text */
  maxLength?: number;
  /** text, regex source (no flags) */
  pattern?: string;
  /** number */
  min?: number;
  /** number */
  max?: number;
  /** number */
  integerOnly?: boolean;
}

export interface PropertyDef {
  /** Unique (case-insensitive) key, also the frontmatter field name. */
  name: string;
  type: PropertyType;
  rules?: PropertyRules;
}

// The named screen regions a layout can describe. Groundwork for a future
// plugin API: plugins will target a region by name to mount into it.
export type LayoutRegionName =
  | "title-bar"
  | "left-ribbon"
  | "left-sidebar"
  | "editor"
  | "right-sidebar"
  | "status-bar";

export interface LayoutRegion {
  /** Stable identity for this region instance, independent of its name. */
  id: string;
  name: LayoutRegionName;
}

export interface Layout {
  id: string;
  name: string;
  regions: LayoutRegion[];
}

export interface LayoutPrefs {
  sidebarWidth: number;
  rightPanelWidth: number;
}

/** How a note's parent folder path is shown in its tab header. */
export type TabFolderDisplay = "never" | "hover" | "always";

/** "system" follows the OS light/dark preference. */
export type ThemeSetting = "dark" | "light" | "system";

export interface AppSettings {
  tabFolderDisplay: TabFolderDisplay;
  /** Stack-relative folder new daily notes are created in. */
  dailyNotesFolder: string;
  theme: ThemeSetting;
  /** Whether a new note is scaffolded with a "# Title" heading. */
  addHeadingToNewNotes: boolean;
  /** Whether a note's properties are collapsed by default in the editor pane. */
  hidePropertiesByDefault: boolean;
  /** Whether the editor shows line numbers in the gutter. */
  showLineNumbers: boolean;
}

export interface DailyNoteResult {
  /** Absolute path on disk */
  path: string;
  /** False if today's daily note already existed and was simply opened. */
  created: boolean;
}

// A plugin declares itself via a manifest.json under
// <stackRoot>/.cairn/plugins/<folder>/manifest.json. Note read/write against
// the current stack is default-granted (see electron/pluginPermissions.ts)
// and therefore isn't a declarable permission here — only capabilities that
// reach outside the current stack need an explicit grant.
export type PluginPermission = "network" | "shell:openExternal";

export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  /** Entry point file, relative to the plugin's own folder. */
  main: string;
  permissions: PluginPermission[];
}

export interface PluginPermissionState {
  granted: PluginPermission[];
  deniedDomains?: string[];
}

export type PluginPermissionsFile = Record<string, PluginPermissionState>;
