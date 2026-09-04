import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { ReactNode } from "react";

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

const VIEWPORT_MARGIN = 4;

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
  const menuRef = useRef<HTMLDivElement>(null);
  // Starts at the raw click position; corrected before paint (see below) so
  // the menu never visibly renders off-screen and then jumps into place.
  const [pos, setPos] = useState({ top: y, left: x });

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

  // Keeps the whole menu on-screen — if opening at (x, y) would run it off
  // the bottom or right edge, pull it back in just far enough to fit.
  useLayoutEffect(() => {
    const el = menuRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    let top = y;
    let left = x;
    if (rect.bottom > window.innerHeight) {
      top = Math.max(VIEWPORT_MARGIN, window.innerHeight - rect.height - VIEWPORT_MARGIN);
    }
    if (rect.right > window.innerWidth) {
      left = Math.max(VIEWPORT_MARGIN, window.innerWidth - rect.width - VIEWPORT_MARGIN);
    }
    setPos({ top, left });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [x, y]);

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
          {entry.children && openSubmenu === entry.label && <Submenu entries={entry.children} render={renderEntries} />}
        </div>
      );
    });
  }

  return (
    <div ref={menuRef} className="context-menu" style={{ top: pos.top, left: pos.left }} onClick={(e) => e.stopPropagation()}>
      {renderEntries(items)}
    </div>
  );
}

/**
 * A submenu flyout, self-correcting if it would otherwise overflow the
 * viewport — flips to open upward/leftward instead of down/right.
 */
function Submenu({
  entries,
  render,
}: {
  entries: ContextMenuEntry[];
  render: (entries: ContextMenuEntry[]) => ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [flip, setFlip] = useState({ up: false, left: false });

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setFlip({
      up: rect.bottom > window.innerHeight,
      left: rect.right > window.innerWidth,
    });
  }, []);

  const className = [
    "context-menu",
    "context-menu-submenu",
    flip.up && "context-menu-submenu-flip-up",
    flip.left && "context-menu-submenu-flip-left",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div ref={ref} className={className}>
      {render(entries)}
    </div>
  );
}
