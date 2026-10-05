import { useMemo } from "react";
import type { RibbonItemContribution } from "../plugins/types";
import { sanitizePluginIcon } from "../plugins/sanitizeIcon";

interface Props {
  onNewNote: (x: number, y: number) => void;
  onOpenDailyNote: (x: number, y: number) => void;
  onGraphView: () => void;
  onOpenSettings: () => void;
  /** Right-click on the "New note" button — opens the note-template picker. */
  onNewNoteContextMenu: (x: number, y: number) => void;
  onOpenHelp: () => void;
  regionId?: string;
  /** Left-ribbon launcher icons contributed by plugins, if any. */
  ribbonItems?: RibbonItemContribution[];
  onOpenRibbonItem?: (item: RibbonItemContribution) => void;
  /** Whether a plugin's ribbon item should read as pressed (its view is showing). */
  isRibbonItemActive?: (item: RibbonItemContribution) => boolean;
}

// Renders a plugin-supplied icon (untrusted, not a fixed icon from
// src/components/icons.tsx) at the same 16x16 size as the app's own menu
// icons: either a whole SVG (sanitised first) or just stroke-style path data.
function RibbonIcon({ item }: { item: RibbonItemContribution }) {
  const svg = useMemo(() => (item.iconSvg ? sanitizePluginIcon(item.iconSvg) : null), [item.iconSvg]);
  if (svg) return <span style={{ display: "flex" }} dangerouslySetInnerHTML={{ __html: svg }} />;
  if (!item.icon) return null;
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d={item.icon} />
    </svg>
  );
}

export function ActivityBar({
  onNewNote,
  onOpenDailyNote,
  onGraphView,
  onOpenSettings,
  onNewNoteContextMenu,
  onOpenHelp,
  regionId,
  ribbonItems = [],
  onOpenRibbonItem,
  isRibbonItemActive,
}: Props) {
  return (
    <nav className="activity-bar" data-region-id={regionId}>
      <button
        className="activity-bar-btn"
        onClick={(e) => onNewNote(e.clientX, e.clientY)}
        onContextMenu={(e) => {
          e.preventDefault();
          onNewNoteContextMenu(e.clientX, e.clientY);
        }}
        title="New blank note (right-click for templates)"
      >
        +
      </button>
      <button
        className="activity-bar-btn"
        onClick={(e) => onOpenDailyNote(e.clientX, e.clientY)}
        title="Open today's note (created automatically the first time)"
      >
        📅
      </button>
      <button className="activity-bar-btn" onClick={onGraphView} title="Graph view">
        ◇
      </button>
      {ribbonItems.map((item) => (
        <button
          key={item.id}
          className={`activity-bar-btn${isRibbonItemActive?.(item) ? " active" : ""}`}
          aria-pressed={isRibbonItemActive?.(item) ?? false}
          onClick={() => onOpenRibbonItem?.(item)}
          title={item.title}
        >
          <RibbonIcon item={item} />
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
