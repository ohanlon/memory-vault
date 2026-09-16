// Hues for the built-in abstract avatars — 12 evenly-spaced for stacks, 6
// for merged views (every other stack hue), so hue alone is enough to tell entries
// apart at a glance without needing hand-authored artwork.
const STACK_HUES = [10, 40, 70, 100, 130, 160, 190, 220, 250, 280, 310, 340];
const MERGED_VIEW_HUES = [10, 70, 130, 190, 250, 310];

export const STACK_AVATAR_COUNT = STACK_HUES.length;
export const MERGED_VIEW_AVATAR_COUNT = MERGED_VIEW_HUES.length;

export type AvatarEntityKind = "stack" | "mergedView";

function huesFor(kind: AvatarEntityKind): number[] {
  return kind === "stack" ? STACK_HUES : MERGED_VIEW_HUES;
}

export function avatarCountFor(kind: AvatarEntityKind): number {
  return huesFor(kind).length;
}

/** Deterministic djb2-style hash -> stable index in [0, count). Used both to
 *  assign a new entry's default avatar (see stackRegistry.ts/mergedViewRegistry.ts)
 *  and as the fallback wherever an entry's `avatar` field is missing (see
 *  EntryAvatar.tsx) — the same formula in both places so they always agree. */
export function defaultAvatarIndexForName(name: string, count: number): number {
  let hash = 5381;
  for (let i = 0; i < name.length; i++) {
    hash = ((hash << 5) + hash + name.charCodeAt(i)) | 0; // hash*33 + c
  }
  return Math.abs(hash) % count;
}

export interface AvatarBlob {
  cx: number;
  cy: number;
  r: number;
  lightness: number;
}

export interface AvatarPalette {
  hue: number;
  backgroundLightness: number;
  blobs: AvatarBlob[];
}

const BLOB_COUNT = 5;
const GOLDEN_ANGLE_DEG = 137.507764;

/** Deterministic blob cluster for (kind, index) — same inputs always
 *  produce the same output, so a given avatar never changes look across
 *  renders/sessions. Blobs sit on a ring whose start angle is offset per
 *  index (golden-angle spacing) purely so adjacent indices don't look like
 *  simple rotations of each other; hue is the real differentiator at a
 *  glance. */
export function avatarPaletteFor(kind: AvatarEntityKind, index: number): AvatarPalette {
  const hues = huesFor(kind);
  const hue = hues[((index % hues.length) + hues.length) % hues.length];
  const startAngle = index * GOLDEN_ANGLE_DEG;
  const blobs: AvatarBlob[] = [];
  for (let i = 0; i < BLOB_COUNT; i++) {
    const angle = ((startAngle + (i * 360) / BLOB_COUNT) * Math.PI) / 180;
    const ringRadius = 55 + (i % 2) * 20;
    blobs.push({
      cx: 128 + Math.cos(angle) * ringRadius,
      cy: 128 + Math.sin(angle) * ringRadius,
      r: 60 + (i % 3) * 10,
      lightness: 78 + (i % 3) * 4,
    });
  }
  return { hue, backgroundLightness: 92, blobs };
}
