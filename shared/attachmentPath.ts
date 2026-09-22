// Shared between electron/attachmentProtocol.ts (serves attachment files
// over this scheme) and src/components/MarkdownPreview.tsx (rewrites a
// note's relative image references into it, since a plain relative path
// resolves against the renderer's own bundle, not the notes folder on
// disk) — kept here since shared/ has no Electron/DOM dependency.
export const ATTACHMENT_SCHEME = "cairn-attachment";
export const ATTACHMENTS_DIRNAME = "attachments";

function hasUrlScheme(href: string): boolean {
  return /^[a-z][a-z0-9+.-]*:/i.test(href);
}

// Resolves a markdown image href (as written in a note's body) against that
// note's own directory, producing a path relative to the notes folder root
// (posix-separated) - or null if the href already has its own URL scheme
// (http:, data:, an already-absolute cairn-attachment:, etc.), is a pure
// in-page anchor, or resolves outside the notes folder root entirely.
export function resolveRelativeAttachmentPath(noteRelativePath: string, href: string): string | null {
  if (href === "" || href.startsWith("#") || hasUrlScheme(href)) return null;

  const withoutFragment = href.split("#")[0];
  const noteDirParts = noteRelativePath.replace(/\\/g, "/").split("/").slice(0, -1);
  const hrefParts = decodeURIComponent(withoutFragment).replace(/\\/g, "/").split("/");

  const stack = [...noteDirParts];
  for (const part of hrefParts) {
    if (part === "" || part === ".") continue;
    if (part === "..") {
      if (stack.length === 0) return null;
      stack.pop();
      continue;
    }
    stack.push(part);
  }
  return stack.join("/");
}

// Builds the URL MarkdownPreview.tsx should render as an <img> src for a
// root-relative attachment path resolved above.
export function attachmentUrl(rootRelativePath: string): string {
  return `${ATTACHMENT_SCHEME}://local/${rootRelativePath.split("/").map(encodeURIComponent).join("/")}`;
}

// The inverse direction: given a note's own path and a root-relative path to
// a freshly saved attachment (see electron/attachments.ts), builds the
// relative markdown reference to insert into that note's body - "../" once
// per directory level the note is nested under the root.
export function relativeAttachmentReference(noteRelativePath: string, rootRelativeAttachmentPath: string): string {
  const depth = noteRelativePath.replace(/\\/g, "/").split("/").length - 1;
  return "../".repeat(depth) + rootRelativeAttachmentPath;
}
