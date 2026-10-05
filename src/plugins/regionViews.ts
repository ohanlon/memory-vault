import type { ViewContribution } from "./types";

export interface ResolvedRegionViews {
  /** The view to render. */
  active: ViewContribution;
  /** Views that get a tab in the strip - exclusive views never do. */
  tabbed: ViewContribution[];
  /** True when the active view is exclusive: render it bare, with no strip. */
  bare: boolean;
}

// Picks what a tabbed region shows. An exclusive view has no tab; it is only
// ever active while explicitly focused (from a ribbon toggle), and then it
// replaces the other views entirely. Otherwise the focused tab wins, falling
// back to the first non-exclusive view.
export function resolveRegionViews(views: ViewContribution[], focusedId: string | undefined): ResolvedRegionViews | null {
  const tabbed = views.filter((v) => !v.exclusive);
  const focused = views.find((v) => v.id === focusedId);
  const active = focused ?? tabbed[0] ?? views[0];
  if (!active) return null;
  return { active, tabbed, bare: !!active.exclusive || tabbed.length <= 1 };
}
