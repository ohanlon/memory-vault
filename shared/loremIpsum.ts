const LOREM_IPSUM_PARAGRAPH =
  "Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.";

export const MAX_LOREM_IPSUM_PARAGRAPHS = 100;

/** Repeats the standard lorem ipsum paragraph `count` times, separated by blank lines. */
export function generateLoremIpsum(count: number): string {
  const n = Math.min(MAX_LOREM_IPSUM_PARAGRAPHS, Math.max(1, Math.floor(count)));
  return Array.from({ length: n }, () => LOREM_IPSUM_PARAGRAPH).join("\n\n");
}
