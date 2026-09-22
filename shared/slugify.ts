// Anchor ids for the vault-wide HTML/PDF export (src/export/vaultExport.ts) -
// one per note, so an internal wikilink/markdown link can point at
// "#slug" within the single combined document instead of a separate file.
export function slugify(text: string): string {
  const slug = text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "note";
}

// Appends "-2", "-3", ... past whatever's already in `taken` - two notes
// whose titles slugify identically (e.g. "My Note" and "My  Note") shouldn't
// collide onto the same anchor. Records the result in `taken` before
// returning it.
export function uniqueSlug(taken: Set<string>, base: string): string {
  if (!taken.has(base)) {
    taken.add(base);
    return base;
  }
  let n = 1;
  let candidate: string;
  do {
    n += 1;
    candidate = `${base}-${n}`;
  } while (taken.has(candidate));
  taken.add(candidate);
  return candidate;
}
