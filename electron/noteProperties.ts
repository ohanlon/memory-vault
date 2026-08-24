import fs from "node:fs";
import matter from "gray-matter";

export function readNoteProperties(absPath: string): Record<string, unknown> {
  const raw = fs.readFileSync(absPath, "utf-8");
  return matter(raw).data ?? {};
}

export function readNoteBody(absPath: string): string {
  const raw = fs.readFileSync(absPath, "utf-8");
  return matter(raw).content;
}

// Rewrites only the frontmatter block, re-reading the file immediately
// before writing so this never clobbers a concurrent body edit made through
// saveNoteBody. An empty properties object removes the frontmatter block
// entirely (gray-matter's own behavior).
export function saveNoteProperties(absPath: string, properties: Record<string, unknown>): void {
  const raw = fs.existsSync(absPath) ? fs.readFileSync(absPath, "utf-8") : "";
  const { content } = matter(raw);
  fs.writeFileSync(absPath, matter.stringify(content, properties), "utf-8");
}

// Rewrites only the body, preserving whatever frontmatter is already on
// disk. Mirror of saveNoteProperties for the editor's save path.
export function saveNoteBody(absPath: string, body: string): void {
  const raw = fs.existsSync(absPath) ? fs.readFileSync(absPath, "utf-8") : "";
  const { data } = matter(raw);
  const updated = data && Object.keys(data).length > 0 ? matter.stringify(body, data) : body;
  fs.writeFileSync(absPath, updated, "utf-8");
}
