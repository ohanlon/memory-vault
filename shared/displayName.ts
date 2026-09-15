/** Strips a trailing ".md" for display, preserving any subfolder path. */
export function stripMdExtension(path: string): string {
  return path.replace(/\.md$/i, "");
}

/** Last path segment, handling both "/" and "\" separators — used to default a new stack's name to its folder name. */
export function basename(fullPath: string): string {
  return fullPath.split(/[/\\]/).filter(Boolean).pop() ?? fullPath;
}
