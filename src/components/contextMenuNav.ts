import type { ContextMenuEntry, ContextMenuItem } from "./ContextMenu";

/** The entries visible after drilling into `path` (labels of submenu triggers, outermost first). Stops at the last level that resolves. */
export function entriesAtPath(root: ContextMenuEntry[], path: string[]): { entries: ContextMenuEntry[]; path: string[] } {
  let entries = root;
  const resolved: string[] = [];
  for (const label of path) {
    const next = entries.find((e): e is ContextMenuItem => !("separator" in e) && e.label === label && !!e.children);
    if (!next?.children) break;
    entries = next.children;
    resolved.push(label);
  }
  return { entries, path: resolved };
}
