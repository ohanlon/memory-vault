import { useEffect, useRef } from "react";

export interface ContextMenuItem {
  label: string;
  onClick: () => void;
  shortcut?: string;
}

interface Props {
  x: number;
  y: number;
  items: ContextMenuItem[];
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

  return (
    <div className="context-menu" style={{ top: y, left: x }} onClick={(e) => e.stopPropagation()}>
      {items.map((item) => (
        <button
          key={item.label}
          className="context-menu-item"
          onClick={() => {
            item.onClick();
            onClose();
          }}
        >
          <span className="context-menu-item-label">{item.label}</span>
          {item.shortcut && <span className="context-menu-item-shortcut">{item.shortcut}</span>}
        </button>
      ))}
    </div>
  );
}
