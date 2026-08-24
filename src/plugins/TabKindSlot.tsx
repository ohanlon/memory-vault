import { pluginRegistry } from "./registry";

interface Props {
  tabId: string | null;
  slotProps: Record<string, unknown>;
}

// Renders whichever tab-kind contribution's `matches` predicate accepts the
// active tab id (e.g. the note editor vs. the graph view).
export function TabKindSlot({ tabId, slotProps }: Props) {
  const kind = pluginRegistry.getTabKind(tabId);
  if (!kind) return null;
  const Component = kind.component;
  return <Component {...slotProps} />;
}
