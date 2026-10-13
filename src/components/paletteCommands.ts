import type { ContextMenuEntry } from "./ContextMenu";

export interface PaletteCommand {
  /** "File › New Note" style path, shown as the row label. */
  label: string;
  run: () => void;
}

/** Flattens menu definitions into runnable commands, dropping separators, disabled items and submenu triggers themselves. */
export function flattenMenus(menus: { label: string; items: ContextMenuEntry[] }[]): PaletteCommand[] {
  const out: PaletteCommand[] = [];
  const walk = (prefix: string, entries: ContextMenuEntry[]) => {
    for (const e of entries) {
      if ("separator" in e) continue;
      const label = `${prefix} › ${e.label}`;
      if (e.children) walk(label, e.children);
      else if (!e.disabled && e.onClick) out.push({ label, run: e.onClick });
    }
  };
  for (const m of menus) walk(m.label, m.items);
  return out;
}

/** Case-insensitive match where every whitespace-separated term must appear; earlier and tighter matches rank first. */
export function filterCommands<T extends { label: string }>(commands: T[], query: string): T[] {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return commands;
  return commands
    .map((c) => {
      const hay = c.label.toLowerCase();
      const positions = terms.map((t) => hay.indexOf(t));
      return { c, score: positions.some((p) => p < 0) ? -1 : positions.reduce((a, b) => a + b, 0) };
    })
    .filter((x) => x.score >= 0)
    .sort((a, b) => a.score - b.score)
    .map((x) => x.c);
}
