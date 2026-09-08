import type { RibbonItemContribution } from "../plugins/types";

interface Props {
  sidebarCollapsed: boolean;
  onToggleSidebar: () => void;
  onNewNote: () => void;
  onNewFolder: () => void;
  onOpenDailyNote: () => void;
  onGraphView: () => void;
  onOpenSettings: () => void;
  /** Right-click on the "New note" button — opens the note-template picker. */
  onNewNoteContextMenu: (x: number, y: number) => void;
  onOpenHelp: () => void;
  regionId?: string;
  /** Left-ribbon launcher icons contributed by plugins, if any. */
  ribbonItems?: RibbonItemContribution[];
  onOpenRibbonItem?: (item: RibbonItemContribution) => void;
}

// Renders an arbitrary, plugin-supplied SVG path (icon.icon is untrusted
// path data, not a fixed icon from src/components/icons.tsx) at the same
// 16x16/stroke-based size as the app's own menu icons.
function RibbonIcon({ d }: { d: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  );
}

export function ActivityBar({
  sidebarCollapsed,
  onToggleSidebar,
  onNewNote,
  onNewFolder,
  onOpenDailyNote,
  onGraphView,
  onOpenSettings,
  onNewNoteContextMenu,
  onOpenHelp,
  regionId,
  ribbonItems = [],
  onOpenRibbonItem,
}: Props) {
  return (
    <nav className="activity-bar" data-region-id={regionId}>
      <div className="activity-bar-top">
        <button
          className="activity-bar-btn activity-bar-btn-sm"
          onClick={onToggleSidebar}
          title={sidebarCollapsed ? "Show navigation" : "Hide navigation"}
        >
          {sidebarCollapsed ? "»" : "«"}
        </button>
      </div>
      <button
        className="activity-bar-btn"
        onClick={onNewNote}
        onContextMenu={(e) => {
          e.preventDefault();
          onNewNoteContextMenu(e.clientX, e.clientY);
        }}
        title="New note (right-click for templates)"
      >
        +
      </button>
      <button className="activity-bar-btn" onClick={onNewFolder} title="New folder">
        ⊞
      </button>
      <button className="activity-bar-btn" onClick={onOpenDailyNote} title="New daily note">
        📅
      </button>
      <button className="activity-bar-btn" onClick={onGraphView} title="Graph view">
        ◇
      </button>
      {ribbonItems.map((item) => (
        <button
          key={item.id}
          className="activity-bar-btn"
          onClick={() => onOpenRibbonItem?.(item)}
          title={item.title}
        >
          <RibbonIcon d={item.icon} />
        </button>
      ))}
      <button className="activity-bar-btn activity-bar-btn-bottom" onClick={onOpenHelp} title="Keyboard shortcuts & help">
        ?
      </button>
      <button className="activity-bar-btn" onClick={onOpenSettings} title="Settings">
        ⚙
      </button>
    </nav>
  );
}
