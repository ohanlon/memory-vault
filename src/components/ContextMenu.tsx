import { useEffect, useRef, useState } from "react";

export interface ContextMenuItem {
  label: string;
  /** Omit when the item is a submenu trigger (has children). */
  onClick?: () => void;
  shortcut?: string;
  /** When present, hovering the item opens a flyout with these entries instead of running onClick. */
  children?: ContextMenuEntry[];
}

export interface ContextMenuSeparator {
  separator: true;
}

export type ContextMenuEntry = ContextMenuItem | ContextMenuSeparator;

interface Props {
  x: number;
  y: number;
  items: ContextMenuEntry[];
  onClose: () => void;
}

export function ContextMenu({ x, y, items, onClose }: Props) {
  // Callers typically pass an inline arrow for onClose, which gets a new
  // identity on every render of theirs (even for unrelated state changes).
  // Reading it through a ref — instead of putting it in the effect's
  // dependency array — keeps the listeners below attached exactly once for
  // this menu's lifetime, always invoking whichever onClose is current.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const [openSubmenu, setOpenSubmenu] = useState<string | null>(null);

  useEffect(() => {
    function handleDismiss(e: Event) {
      if (e instanceof KeyboardEvent && e.key !== "Escape") return;
      onCloseRef.current();
    }
    // Defer attaching the listeners to the next tick — the right-click that
    // opened this menu is still bubbling up to window when this effect runs,
    // and an immediately-attached listener would catch that same event and
    // close the menu the instant it opens.
    const timer = setTimeout(() => {
      window.addEventListener("click", handleDismiss);
      window.addEventListener("contextmenu", handleDismiss);
      window.addEventListener("keydown", handleDismiss);
    }, 0);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("click", handleDismiss);
      window.removeEventListener("contextmenu", handleDismiss);
      window.removeEventListener("keydown", handleDismiss);
    };
  }, []);

  function renderEntries(entries: ContextMenuEntry[]) {
    return entries.map((entry, i) => {
      if ("separator" in entry) {
        return <div key={`separator-${i}`} className="context-menu-separator" />;
      }
      return (
        <div
          key={entry.label}
          className="context-menu-item-wrapper"
          onMouseEnter={() => entry.children && setOpenSubmenu(entry.label)}
          onMouseLeave={() => entry.children && setOpenSubmenu((cur) => (cur === entry.label ? null : cur))}
        >
          <button
            className="context-menu-item"
            onClick={() => {
              if (entry.children) return;
              entry.onClick?.();
              onClose();
            }}
          >
            <span className="context-menu-item-label">{entry.label}</span>
            {entry.shortcut && <span className="context-menu-item-shortcut">{entry.shortcut}</span>}
            {entry.children && <span className="context-menu-item-caret">›</span>}
          </button>
          {entry.children && openSubmenu === entry.label && (
            <div className="context-menu context-menu-submenu">{renderEntries(entry.children)}</div>
          )}
        </div>
      );
    });
  }

  return (
    <div className="context-menu" style={{ top: y, left: x }} onClick={(e) => e.stopPropagation()}>
      {renderEntries(items)}
    </div>
  );
}
