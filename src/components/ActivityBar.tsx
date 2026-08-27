interface Props {
  sidebarCollapsed: boolean;
  onToggleSidebar: () => void;
  onNewNote: () => void;
  onNewFolder: () => void;
  onGraphView: () => void;
  onOpenSettings: () => void;
  regionId?: string;
}

export function ActivityBar({
  sidebarCollapsed,
  onToggleSidebar,
  onNewNote,
  onNewFolder,
  onGraphView,
  onOpenSettings,
  regionId,
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
      <button className="activity-bar-btn" onClick={onNewNote} title="New note">
        +
      </button>
      <button className="activity-bar-btn" onClick={onNewFolder} title="New folder">
        ⊞
      </button>
      <button className="activity-bar-btn" onClick={onGraphView} title="Graph view">
        ◇
      </button>
      <button className="activity-bar-btn activity-bar-btn-bottom" onClick={onOpenSettings} title="Settings">
        ⚙
      </button>
    </nav>
  );
}
