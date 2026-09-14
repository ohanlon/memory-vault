import fs from "node:fs";
import path from "node:path";
import { listMarkdownFiles } from "./stack";
import { titleFromPath } from "../shared/parseNote";
import { replaceAllInContent, searchContent } from "../shared/search";
import type { ReplaceAllResult, SearchFileResult, SearchOptions } from "../shared/types";

/**
 * Walks every markdown file under root and streams a result per matching
 * file via onResult, yielding to the event loop between files so the
 * search stays cancellable and doesn't block IPC/UI while it runs.
 */
export async function runSearch(
  root: string,
  options: SearchOptions,
  onResult: (result: SearchFileResult) => void,
  isCancelled: () => boolean
): Promise<void> {
  const files = await listMarkdownFiles(root);

  for (const file of files) {
    if (isCancelled()) return;

    let content: string;
    try {
      content = await fs.promises.readFile(file, "utf-8");
    } catch {
      continue;
    }

    const matches = searchContent(content, options);
    if (matches.length > 0) {
      const relativePath = path.relative(root, file);
      onResult({ path: file, relativePath, title: titleFromPath(relativePath), matches });
    }

    await new Promise<void>((resolve) => setImmediate(resolve));
  }
}

/** Walks every markdown file under root, rewriting each one that has a match. The file watcher (see watchStack) picks up the writes and refreshes the app the same way an external edit would. */
export async function runReplaceAll(
  root: string,
  options: SearchOptions,
  replaceText: string
): Promise<ReplaceAllResult> {
  const files = await listMarkdownFiles(root);
  let filesChanged = 0;
  let replacements = 0;

  for (const file of files) {
    let content: string;
    try {
      content = await fs.promises.readFile(file, "utf-8");
    } catch {
      continue;
    }

    const { content: updated, count } = replaceAllInContent(content, options, replaceText);
    if (count > 0) {
      await fs.promises.writeFile(file, updated, "utf-8");
      filesChanged++;
      replacements += count;
    }
  }

  return { filesChanged, replacements };
}
