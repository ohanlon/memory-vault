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
  /** Path relative to the notes folder root */
  relativePath: string;
  frontmatter: Record<string, unknown>;
  tags: string[];
  links: WikiLink[];
  content: string;
  mtimeMs: number;
}

export interface GraphNode {
  // A note's title; a "#tag" id for a tag hub; or a URL for an external node.
  id: string;
  path: string;
  tags: string[];
  /** True if this node represents an external URL rather than a note. */
  external?: boolean;
  /** True if this node represents a tag hub (id is "#tagname") rather than a note. */
  isTag?: boolean;
}

export interface GraphEdge {
  source: string; // note's graph node id (see GraphNode.id)
  target: string; // note's graph node id, a "#tag" id, or a URL for an external-link edge
  kind: "wikilink" | "tag" | "external-link";
  /** For kind "tag", which tag produced this edge (without the "#" prefix) */
  tag?: string;
}

export interface GraphModel {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface NotesFolderIndex {
  root: string;
  notes: Note[];
}

/** Sent when the background reconciliation pass (kicked off by
 *  notesFolder:load) finds the on-disk vault differs from the cached index. */
export interface NotesFolderReconciledEvent {
  root: string;
  notes: Note[];
}

/** Brackets the background reconciliation pass (kicked off by
 *  notesFolder:load) regardless of whether it finds any changes, so the UI
 *  can show a reindexing indicator for its duration. */
export interface NotesFolderReconcileStatusEvent {
  root: string;
  reconciling: boolean;
}

/** One of the deterministically-generated abstract pastel avatars (see
 *  shared/avatars.ts) — `index` selects which one. */
export interface AvatarRef {
  kind: "builtin";
  index: number;
}

export interface NotesFolderEntry {
  /** Display name, as typed by the user. Uniqueness is enforced case-insensitively. */
  name: string;
  /** Absolute path to the notes folder's root. */
  root: string;
  /** Absent on entries created before avatars existed — see EntryAvatar.tsx for the fallback. */
  avatar?: AvatarRef;
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

// Persisted per notes folder (under <root>/.cairn/workspace.json) so
// reopening restores which notes were open.
/** A bare sentinel tab id (e.g. "@graph", never root-qualified) or a real
 *  note, qualified by which notes folder root it belongs to. */
export type WorkspaceTabRef = string | { root: string; relativePath: string };

export interface WorkspaceState {
  /** Open tabs, in order. */
  openTabs: WorkspaceTabRef[];
  /** The active tab, if any. */
  activeTab: WorkspaceTabRef | null;
}

/** How a note's parent folder path is shown in its tab header. */
export type TabFolderDisplay = "never" | "hover" | "always";

/** "system" follows the OS light/dark preference. "custom" uses AppSettings.activeCustomThemeId. */
export type ThemeSetting = "dark" | "light" | "system" | "custom";

/** A user-defined color theme — full control over every themeable CSS variable (see shared/themeColors.ts). */
export interface CustomTheme {
  id: string;
  name: string;
  /** Which built-in preset this theme is based on — drives the CodeMirror
   *  editor theme (only dark/light presets exist) and the data-theme
   *  attribute fallback. Chosen once, when the theme is created. */
  baseMode: "dark" | "light";
  /** Keyed by CSS variable name without the "--" prefix, e.g. "bg-base". */
  colors: Record<string, string>;
}

/** Font choices for the editing pane — a curated set so every option renders consistently. */
export type EditorFontFamily =
  | "system-ui"
  | "roboto"
  | "arimo"
  | "monospace"
  | "open-sans"
  | "montserrat"
  | "scoutie-sans"
  | "valley-sans";

export interface AppSettings {
  tabFolderDisplay: TabFolderDisplay;
  theme: ThemeSetting;
  /** Whether a new note is scaffolded with a "# Title" heading. */
  addHeadingToNewNotes: boolean;
  /** Whether a note's properties are collapsed by default in the editor pane. */
  hidePropertiesByDefault: boolean;
  /** Whether the editor shows line numbers in the gutter. */
  showLineNumbers: boolean;
  /** Font family used in the editing pane. */
  editorFontFamily: EditorFontFamily;
  /** Font size (px) used in the editing pane. */
  editorFontSize: number;
  /** highlight.js language ids (see shared/codeLanguages.ts) enabled for code-block syntax highlighting. */
  enabledCodeLanguages: string[];
  /** Whether the one-time "type [[ to link a note" hint has already been shown. */
  hasSeenWikilinkHint: boolean;
  /** Whether the one-time "#tags connect notes" hint has already been shown. */
  hasSeenTagHint: boolean;
  /** Whether the one-time "this is your notes graph" hint has already been shown. */
  hasSeenGraphHint: boolean;
  /** Token-based date pattern (see shared/dateFormat.ts), e.g. "YYYY-MM-DD" — applied to daily note filenames/headings, and the default for {{date}} in templates. */
  dateFormat: string;
  /** Token-based time pattern, e.g. "HH:mm" — the default for {{time}} in templates. */
  timeFormat: string;
  /** Token-based date+time pattern, e.g. "YYYY-MM-DD HH:mm" — the default for {{datetime}} in templates. */
  datetimeFormat: string;
  /** User-defined color themes, selectable from the theme dropdown when theme === "custom". */
  customThemes: CustomTheme[];
  /** Which entry of customThemes is active — only meaningful when theme === "custom". */
  activeCustomThemeId: string | null;
}

export interface DailyNoteResult {
  /** Absolute path on disk */
  path: string;
  /** False if today's daily note already existed and was simply opened. */
  created: boolean;
}

// A plugin declares itself via a manifest.json under
// <root>/.cairn/plugins/<folder>/manifest.json. Note read/write against
// the current notes folder is default-granted (see electron/pluginPermissions.ts)
// and therefore isn't a declarable permission here — only capabilities that
// reach outside the current notes folder need an explicit grant.
export type PluginPermission = "network" | "shell:openExternal";

/** A sidebar panel a plugin contributes, rendered via a sandboxed iframe (see src/plugins/PluginViewFrame.tsx). */
export interface PluginView {
  id: string;
  title: string;
  region: "left-sidebar" | "right-sidebar";
  /** HTML entry point for this view, relative to the plugin's own folder. */
  entry: string;
}

/** A full-pane tab this plugin contributes to the main editor area, rendered via a sandboxed iframe like a view. */
export interface PluginTab {
  id: string;
  title: string;
  /** HTML entry point for this tab, relative to the plugin's own folder. */
  entry: string;
}

/** A left-ribbon launcher icon a plugin contributes — clicking it reveals/focuses one of the plugin's own declared views, or opens one of its declared tabs. Exactly one of opensView/opensTab must be set. */
export interface PluginRibbonItem {
  id: string;
  title: string;
  /** SVG path `d` data, rendered at 16x16 with stroke="currentColor". */
  icon: string;
  /** id of one of this plugin's declared `views` to reveal and focus when clicked. */
  opensView?: string;
  /** id of one of this plugin's declared `tabs` to open when clicked. */
  opensTab?: string;
}

/**
 * A file-tree context-menu entry a plugin contributes. Clicking it pushes a
 * "contextMenuAction" event (see shared/pluginProtocol.ts) into the
 * plugin's iframe — which requires one of the plugin's views to currently
 * be open (see src/plugins/pluginFrameRegistry.ts); the item is hidden from
 * the menu otherwise rather than shown and silently doing nothing.
 */
export interface PluginContextMenuItem {
  id: string;
  label: string;
  target: "note" | "folder";
}

export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  /** Entry point file, relative to the plugin's own folder. */
  main: string;
  permissions: PluginPermission[];
  /** Sidebar views this plugin contributes, if any. */
  views?: PluginView[];
  /** Main-editor-area tabs this plugin contributes, if any. */
  tabs?: PluginTab[];
  /** Left-ribbon launcher icons this plugin contributes, if any. */
  ribbonItems?: PluginRibbonItem[];
  /** File-tree context-menu entries this plugin contributes, if any. */
  contextMenuItems?: PluginContextMenuItem[];
}

export interface PluginPermissionState {
  granted: PluginPermission[];
  deniedDomains?: string[];
}

export type PluginPermissionsFile = Record<string, PluginPermissionState>;

export type SearchMode = "plain" | "regex";

export interface SearchOptions {
  query: string;
  mode: SearchMode;
  /** Only applies when mode is "plain" — regex mode expects users to write their own \b. */
  wholeWord: boolean;
  caseSensitive?: boolean;
}

export interface SearchMatch {
  /** 1-based line number within the note's content. */
  line: number;
  lineText: string;
  /** Character offsets of the match within lineText. */
  start: number;
  end: number;
}

export interface SearchFileResult {
  /** Absolute path on disk */
  path: string;
  relativePath: string;
  title: string;
  matches: SearchMatch[];
}

export interface ReplaceAllResult {
  filesChanged: number;
  replacements: number;
}

/** A user-created template file living in a notes folder's hidden .templates folder. */
export interface FileTemplate {
  /** Absolute path to the template .md file on disk. */
  path: string;
  /** Filename without the .md extension — display label and lookup key. */
  name: string;
}

/** A recorded local version snapshot of a note - see electron/noteHistory.ts. */
export interface NoteHistoryEntry {
  /** ISO 8601 timestamp, also the key used to read/restore this snapshot. */
  timestamp: string;
}
