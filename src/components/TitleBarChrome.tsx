interface Props {
  rightPanelCollapsed: boolean;
  onToggleRightPanel: () => void;
  showRightPanelToggle: boolean;
  regionId?: string;
}

export function TitleBarChrome({
  rightPanelCollapsed,
  onToggleRightPanel,
  showRightPanelToggle,
  regionId,
}: Props) {
  return (
    <div className="titlebar-drag" data-region-id={regionId}>
      {showRightPanelToggle && (
        <button
          className="titlebar-collapse-btn"
          onClick={onToggleRightPanel}
          title={rightPanelCollapsed ? "Show right panel" : "Hide right panel"}
        >
          {rightPanelCollapsed ? "»" : "«"}
        </button>
      )}
    </div>
  );
}
