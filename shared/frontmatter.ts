// Renderer-safe utility: strips a leading YAML frontmatter block using only
// regex, with no YAML parsing (no gray-matter/js-yaml dependency). Not part
// of the editor's load/save path — that goes through IPC so the same
// gray-matter parse governs both the read-split and the write-rejoin.
const FRONTMATTER_RE = /^---\r?\n[\s\S]*?\r?\n---\r?\n?/;

export function stripFrontmatter(raw: string): string {
  return raw.replace(FRONTMATTER_RE, "");
}

export function hasFrontmatter(raw: string): boolean {
  return FRONTMATTER_RE.test(raw);
}
