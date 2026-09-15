import fs from "node:fs";
import path from "node:path";
import { protocol } from "electron";
import { AVATAR_SCHEME } from "../shared/avatarProtocol";
import { avatarDirPath } from "./avatarStorage";
import { contentTypeFor } from "./pluginProtocol";

export { AVATAR_SCHEME };

export function registerAvatarScheme(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: AVATAR_SCHEME,
      privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true },
    },
  ]);
}

/** Resolves a cairn-avatar://<kind>/<name>/<fileName> URL to an absolute
 *  path under that entry's avatar folder, refusing anything that would
 *  escape it — mirrors resolvePluginFilePath in pluginProtocol.ts. Unlike
 *  that resolver, `name` and `fileName` are matched as exactly one path
 *  segment each (the URL shape here is fixed at two segments) rather than
 *  an arbitrary nested relative path, which closes off "../" tricks before
 *  the path.relative() check even runs. */
export function resolveAvatarFilePath(userDataDir: string, url: URL): string | null {
  const kind = url.hostname;
  if (kind !== "stack" && kind !== "cairn") return null;
  const segments = url.pathname.replace(/^\/+/, "").split("/");
  if (segments.length !== 2) return null;
  const [name, fileName] = segments.map(decodeURIComponent);
  if (!name || !fileName || fileName.includes("/") || fileName.includes("\\")) return null;
  const dir = path.resolve(avatarDirPath(userDataDir, kind, name));
  const resolved = path.resolve(dir, fileName);
  const rel = path.relative(dir, resolved);
  if (rel.startsWith("..") || path.isAbsolute(rel)) return null;
  return resolved;
}

export function handleAvatarProtocol(userDataDir: string): void {
  protocol.handle(AVATAR_SCHEME, async (request) => {
    const url = new URL(request.url);
    const filePath = resolveAvatarFilePath(userDataDir, url);
    if (!filePath || !fs.existsSync(filePath)) return new Response("Not found", { status: 404 });
    const body = fs.readFileSync(filePath);
    return new Response(body, {
      headers: { "Content-Type": contentTypeFor(filePath), "Cache-Control": "no-cache" },
    });
  });
}
