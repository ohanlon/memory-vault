import hljs from "highlight.js/lib/core";
import type { LanguageFn } from "highlight.js";
import { CODE_LANGUAGE_ALIASES, CODE_LANGUAGES } from "@shared/codeLanguages";

const KNOWN_IDS = new Set(CODE_LANGUAGES.map((l) => l.id));
const loadingPromises = new Map<string, Promise<void>>();

// Each language's grammar is its own small module, imported on demand rather
// than all ~190 being bundled up front — this keeps the app fast to load
// regardless of how many languages the user enables in Settings > Code.
function loadLanguage(id: string): Promise<void> {
  let promise = loadingPromises.get(id);
  if (promise) return promise;
  promise = import(`highlight.js/lib/languages/${id}`)
    .then((mod: { default?: LanguageFn } | LanguageFn) => {
      const def = typeof mod === "function" ? mod : mod.default;
      if (def) hljs.registerLanguage(id, def);
    })
    .catch(() => {
      // Unknown/failed language id — leave unregistered; callers fall back to plain rendering.
    });
  loadingPromises.set(id, promise);
  return promise;
}

/** Resolves a fenced code block's raw language token (e.g. "js") to its canonical id (e.g. "javascript"). */
export function resolveLanguageId(infoString: string | undefined): string | undefined {
  const token = infoString?.trim().split(/\s+/)[0]?.toLowerCase();
  return token ? CODE_LANGUAGE_ALIASES[token] : undefined;
}

/** Ensures every given (canonical) language id is loaded/registered, so highlightCode can use it synchronously afterward. */
export async function ensureLanguagesLoaded(ids: Iterable<string>): Promise<void> {
  await Promise.all(
    Array.from(new Set(ids))
      .filter((id) => KNOWN_IDS.has(id) && !hljs.getLanguage(id))
      .map(loadLanguage)
  );
}

/** Which enabled languages are referenced by fenced code blocks in `content`, for pre-loading before render. */
export function extractNeededLanguageIds(content: string, enabledLanguageIds: ReadonlySet<string>): string[] {
  const ids = new Set<string>();
  for (const m of content.matchAll(/^```[ \t]*(\S+)/gm)) {
    const id = resolveLanguageId(m[1]);
    if (id && enabledLanguageIds.has(id)) ids.add(id);
  }
  return Array.from(ids);
}

export interface HighlightedCode {
  html: string;
  language: string;
}

/**
 * Highlights `code` as `infoString`'s language if it's both enabled and
 * already loaded (see ensureLanguagesLoaded); returns null otherwise so the
 * caller can fall back to plain, unhighlighted rendering.
 */
export function highlightCode(
  code: string,
  infoString: string | undefined,
  enabledLanguageIds: ReadonlySet<string>
): HighlightedCode | null {
  const language = resolveLanguageId(infoString);
  if (!language || !enabledLanguageIds.has(language) || !hljs.getLanguage(language)) return null;
  const { value } = hljs.highlight(code, { language, ignoreIllegals: true });
  return { html: value, language };
}
