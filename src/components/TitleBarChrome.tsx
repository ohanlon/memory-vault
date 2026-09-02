interface Props {
  rightPanelCollapsed: boolean;
  onToggleRightPanel: () => void;
  showRightPanelToggle: boolean;
  regionId?: string;
  activeName?: string | null;
  root?: string | null;
  onSwitchStack?: () => void;
}

export function TitleBarChrome({
  rightPanelCollapsed,
  onToggleRightPanel,
  showRightPanelToggle,
  regionId,
  activeName,
  root,
  onSwitchStack,
}: Props) {
  const stackLabel = activeName ?? root?.split(/[\\/]/).pop();

  return (
    <div className="titlebar-drag" data-region-id={regionId}>
      {onSwitchStack && (
        <div className="titlebar-stack">
          <span className="titlebar-stack-name" title={root ?? undefined}>
            {stackLabel}
          </span>
          <button className="titlebar-switch-btn" onClick={onSwitchStack} title="Switch to a different stack">
            Switch
          </button>
        </div>
      )}
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
