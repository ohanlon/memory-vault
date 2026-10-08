import { useSyncExternalStore } from "react";

// Below this width the three-pane desktop layout (ribbon + sidebar + editor +
// right panel) can't fit, so the side panels become overlay drawers.
const COMPACT_QUERY = "(max-width: 768px)";

export function isCompactViewport(): boolean {
  return window.matchMedia(COMPACT_QUERY).matches;
}

function subscribe(onChange: () => void): () => void {
  const mql = window.matchMedia(COMPACT_QUERY);
  mql.addEventListener("change", onChange);
  return () => mql.removeEventListener("change", onChange);
}

export function useCompactViewport(): boolean {
  return useSyncExternalStore(subscribe, isCompactViewport);
}
