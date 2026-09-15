import type { AvatarEntityKind } from "@shared/avatars";
import { avatarPaletteFor } from "@shared/avatars";

interface AvatarSvgProps {
  kind: AvatarEntityKind;
  index: number;
  /** Rendered pixel size — the viewBox is always 256x256, this just scales it. */
  size?: number;
  className?: string;
}

export function AvatarSvg({ kind, index, size = 40, className }: AvatarSvgProps) {
  const palette = avatarPaletteFor(kind, index);
  return (
    <svg width={size} height={size} viewBox="0 0 256 256" className={className} role="img" aria-hidden="true">
      <rect width="256" height="256" rx="128" fill={`hsl(${palette.hue}, 55%, ${palette.backgroundLightness}%)`} />
      {palette.blobs.map((blob, i) => (
        <circle
          key={i}
          cx={blob.cx}
          cy={blob.cy}
          r={blob.r}
          fill={`hsl(${palette.hue}, 65%, ${blob.lightness}%)`}
          opacity={0.85}
        />
      ))}
    </svg>
  );
}
