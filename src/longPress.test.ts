import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { longPressProps } from "./longPress";

const touch = (x: number, y: number) => ({ pointerType: "touch", clientX: x, clientY: y }) as never;

describe("longPressProps", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("fires after the delay with the press position", () => {
    const open = vi.fn();
    const p = longPressProps(open);
    p.onPointerDown(touch(5, 7));
    vi.advanceTimersByTime(500);
    expect(open).toHaveBeenCalledWith(5, 7);
    p.onPointerUp();
  });

  it("is cancelled by release or by moving", () => {
    const open = vi.fn();
    const p = longPressProps(open);
    p.onPointerDown(touch(0, 0));
    p.onPointerUp();
    vi.advanceTimersByTime(500);
    p.onPointerDown(touch(0, 0));
    p.onPointerMove(touch(40, 0));
    vi.advanceTimersByTime(500);
    expect(open).not.toHaveBeenCalled();
  });

  it("ignores the contextmenu event that follows a handled long press", () => {
    const open = vi.fn();
    const p = longPressProps(open);
    p.onPointerDown(touch(1, 1));
    vi.advanceTimersByTime(500);
    p.onContextMenu({ preventDefault() {}, clientX: 1, clientY: 1 } as never);
    expect(open).toHaveBeenCalledTimes(1);
  });
});
