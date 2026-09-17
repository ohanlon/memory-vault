interface Props {
  rightPanelCollapsed: boolean;
  onToggleRightPanel: () => void;
  showRightPanelToggle: boolean;
  regionId?: string;
  activeName?: string | null;
  root?: string | null;
  onSwitchNotesFolder?: () => void;
}

export function TitleBarChrome({
  rightPanelCollapsed,
  onToggleRightPanel,
  showRightPanelToggle,
  regionId,
  activeName,
  root,
  onSwitchNotesFolder,
}: Props) {
  const notesFolderLabel = activeName ?? root?.split(/[\\/]/).pop();

  return (
    <div className="titlebar-drag" data-region-id={regionId}>
      {onSwitchNotesFolder && (
        <div className="titlebar-notes-folder">
          <span className="titlebar-notes-folder-name" title={root ?? undefined}>
            {notesFolderLabel}
          </span>
          <button className="titlebar-switch-btn" onClick={onSwitchNotesFolder} title="Switch notes folder">
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
