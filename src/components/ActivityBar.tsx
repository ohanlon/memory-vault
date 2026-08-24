interface Props {
  sidebarCollapsed: boolean;
  onToggleSidebar: () => void;
  rightPanelCollapsed: boolean;
  onToggleRightPanel: () => void;
  onNewNote: () => void;
  onGraphView: () => void;
}

export function ActivityBar({
  sidebarCollapsed,
  onToggleSidebar,
  rightPanelCollapsed,
  onToggleRightPanel,
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
        <button
          className="activity-bar-btn activity-bar-btn-sm"
          onClick={onToggleRightPanel}
          title={rightPanelCollapsed ? "Show right panel" : "Hide right panel"}
        >
          {rightPanelCollapsed ? "«" : "»"}
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
