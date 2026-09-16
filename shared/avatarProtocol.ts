// Custom-uploaded avatars are served from userData via this scheme rather
// than embedded as base64 in stacks.json/mergedViews.json or React state — see
// electron/avatarProtocol.ts for the handler. No Electron/DOM dependency
// here so it's safe to import from both main and renderer.
export const AVATAR_SCHEME = "cairn-avatar";

export type AvatarEntityUrlKind = "stack" | "mergedView";

/** cairn-avatar://<kind>/<encoded-name>/<encoded-fileName>?v=<updatedAt>
 *  `v` is pure cache-busting (never read by the protocol handler) — without
 *  it, re-uploading a new avatar.png would keep showing the renderer's
 *  cached copy of the old image since the URL would otherwise be identical
 *  across the change. */
export function avatarUrl(kind: AvatarEntityUrlKind, name: string, fileName: string, updatedAt: number): string {
  return `${AVATAR_SCHEME}://${kind}/${encodeURIComponent(name)}/${encodeURIComponent(fileName)}?v=${updatedAt}`;
}
