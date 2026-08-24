interface Props {
  sidebarCollapsed: boolean;
  onToggleSidebar: () => void;
  onNewNote: () => void;
  onGraphView: () => void;
}

export function ActivityBar({
  sidebarCollapsed,
  onToggleSidebar,
  onNewNote,
  onGraphView,
}: Props) {
  return (
    <nav className="activity-bar">
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
      <button className="activity-bar-btn" onClick={onGraphView} title="Graph view">
        ◇
      </button>
    </nav>
  );
}
