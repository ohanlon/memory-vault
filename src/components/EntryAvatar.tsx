import type { AvatarEntityKind } from "@shared/avatars";
import { MERGED_VIEW_AVATAR_COUNT, STACK_AVATAR_COUNT, defaultAvatarIndexForName } from "@shared/avatars";
import type { AvatarRef } from "@shared/types";
import { AvatarSvg } from "./AvatarSvg";

interface EntryAvatarProps {
  kind: AvatarEntityKind;
  name: string;
  /** Undefined for entries created before avatars existed. */
  avatar: AvatarRef | undefined;
  size?: number;
  className?: string;
}

export function EntryAvatar({ kind, name, avatar, size = 40, className }: EntryAvatarProps) {
  // Defensive fallback for an entry with no `avatar` field at all (created
  // before this feature shipped) — reuses the exact same hash used at
  // creation time, so it always agrees with what a freshly-created entry
  // of the same name would get. See shared/types.ts for why this isn't
  // backfilled into stacks.json/mergedViews.json on read instead.
  const count = kind === "stack" ? STACK_AVATAR_COUNT : MERGED_VIEW_AVATAR_COUNT;
  const index = avatar?.kind === "builtin" ? avatar.index : defaultAvatarIndexForName(name, count);
  return <AvatarSvg kind={kind} index={index} size={size} className={className} />;
}
