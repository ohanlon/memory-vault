/** Strips a trailing ".md" for display, preserving any subfolder path. */
export function stripMdExtension(path: string): string {
  return path.replace(/\.md$/i, "");
}

/** Last path segment, handling both "/" and "\" separators — used to default a new notes folder's name to its folder name. */
export function basename(fullPath: string): string {
  return fullPath.split(/[/\\]/).filter(Boolean).pop() ?? fullPath;
}

/** Parent directory of a path, handling both "/" and "\" separators — used to find where a note's containing folder is. */
export function dirname(fullPath: string): string {
  const idx = Math.max(fullPath.lastIndexOf("/"), fullPath.lastIndexOf("\\"));
  return idx === -1 ? "" : fullPath.slice(0, idx);
}
