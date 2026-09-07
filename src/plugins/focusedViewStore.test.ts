import { describe, expect, it, vi } from "vitest";
import { focusView, getFocusedView, subscribeFocusedView } from "./focusedViewStore";

describe("focusedViewStore", () => {
  it("returns undefined for a region with nothing focused yet", () => {
    expect(getFocusedView("region-a")).toBeUndefined();
  });

  it("stores the focused view id per region", () => {
    focusView("region-b", "view-1");
    focusView("region-c", "view-2");
    expect(getFocusedView("region-b")).toBe("view-1");
    expect(getFocusedView("region-c")).toBe("view-2");
  });

  it("overwrites a region's previously focused view", () => {
    focusView("region-d", "view-1");
    focusView("region-d", "view-2");
    expect(getFocusedView("region-d")).toBe("view-2");
  });

  it("notifies subscribers on every focus change", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeFocusedView(listener);
    focusView("region-e", "view-1");
    focusView("region-e", "view-2");
    expect(listener).toHaveBeenCalledTimes(2);
    unsubscribe();
  });

  it("stops notifying after unsubscribe", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeFocusedView(listener);
    unsubscribe();
    focusView("region-f", "view-1");
    expect(listener).not.toHaveBeenCalled();
  });
});
