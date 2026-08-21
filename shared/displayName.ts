/** Strips a trailing ".md" for display, preserving any subfolder path. */
export function stripMdExtension(path: string): string {
  return path.replace(/\.md$/i, "");
}
