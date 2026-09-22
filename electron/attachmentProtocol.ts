import fs from "node:fs";
import path from "node:path";
import { protocol } from "electron";
import { contentTypeFor } from "./pluginProtocol";
import { ATTACHMENT_SCHEME } from "../shared/attachmentPath";

export { ATTACHMENT_SCHEME };

// Registered so MarkdownPreview.tsx can render a note's relative image
// references (e.g. "attachments/foo.png") as an <img src> that actually
// resolves to a file on disk - a plain relative path would resolve against
// the renderer's own bundle origin instead, not the (arbitrary, user-picked)
// notes folder root.

export function registerAttachmentScheme(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: ATTACHMENT_SCHEME,
      privileges: { standard: true, secure: true, supportFetchAPI: true },
    },
  ]);
}

// Resolves a request path against the currently active notes folder root,
// refusing anything that escapes it - mirrors resolvePluginFilePath in
// pluginProtocol.ts for the same reason.
export function resolveAttachmentFilePath(root: string, requestPathname: string): string | null {
  const decoded = decodeURIComponent(requestPathname).replace(/^\/+/, "");
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(resolvedRoot, decoded);
  const rel = path.relative(resolvedRoot, resolved);
  if (rel.startsWith("..") || path.isAbsolute(rel)) return null;
  return resolved;
}

export function handleAttachmentProtocol(getActiveRoot: () => string | null): void {
  protocol.handle(ATTACHMENT_SCHEME, async (request) => {
    const root = getActiveRoot();
    if (!root) return new Response("No notes folder open", { status: 404 });

    const url = new URL(request.url);
    const filePath = resolveAttachmentFilePath(root, url.pathname);
    if (!filePath || !fs.existsSync(filePath)) return new Response("Not found", { status: 404 });

    const body = fs.readFileSync(filePath);
    return new Response(body, { headers: { "Content-Type": contentTypeFor(filePath) } });
  });
}
