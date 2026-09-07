// TabbedRegion's active tab was local useState, unreachable from outside
// (e.g. a left-ribbon launcher button rendered in a completely different
// part of the tree). This lifts it into a small external store so both a
// TabbedRegion's own tab clicks and an external "focus this view" call
// agree on the same source of truth. Same shape as pluginStatusStore.
type Listener = () => void;

const focused = new Map<string, string>(); // region name -> view id
const listeners = new Set<Listener>();

export function focusView(region: string, viewId: string): void {
  focused.set(region, viewId);
  listeners.forEach((l) => l());
}

export function getFocusedView(region: string): string | undefined {
  return focused.get(region);
}

export function subscribeFocusedView(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
