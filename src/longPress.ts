import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from "react";

const DELAY_MS = 450;
const MOVE_TOLERANCE_PX = 10;
// Android WebViews also fire `contextmenu` on a long press; ignore it if we just handled the press ourselves.
const CONTEXT_DEDUPE_MS = 800;

// Only one finger press is tracked at a time, so state lives at module level: row components are
// built in render loops (no per-row hooks) and may re-render mid-press.
let timer: ReturnType<typeof setTimeout> | null = null;
let startX = 0;
let startY = 0;
let firedAt = 0;

function cancel() {
  if (timer) clearTimeout(timer);
  timer = null;
}

/**
 * Props to spread on an element so a touch long press (or a right-click) calls `onOpen` with the
 * press position. A long press also swallows the click that follows lifting the finger.
 */
export function longPressProps(onOpen: (x: number, y: number) => void) {
  return {
    onPointerDown(e: ReactPointerEvent) {
      if (e.pointerType !== "touch") return;
      cancel();
      startX = e.clientX;
      startY = e.clientY;
      timer = setTimeout(() => {
        timer = null;
        firedAt = Date.now();
        onOpen(startX, startY);
      }, DELAY_MS);
    },
    onPointerMove(e: ReactPointerEvent) {
      if (timer && Math.hypot(e.clientX - startX, e.clientY - startY) > MOVE_TOLERANCE_PX) cancel();
    },
    onPointerUp: cancel,
    onPointerCancel: cancel,
    onContextMenu(e: ReactMouseEvent) {
      e.preventDefault();
      if (Date.now() - firedAt < CONTEXT_DEDUPE_MS) return;
      cancel();
      firedAt = Date.now();
      onOpen(e.clientX, e.clientY);
    },
    onClickCapture(e: ReactMouseEvent) {
      if (Date.now() - firedAt < 400) {
        e.preventDefault();
        e.stopPropagation();
      }
    },
  };
}
