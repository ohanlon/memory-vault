import hljs from "highlight.js/lib/core";
import bash from "highlight.js/lib/languages/bash";
import c from "highlight.js/lib/languages/c";
import cpp from "highlight.js/lib/languages/cpp";
import csharp from "highlight.js/lib/languages/csharp";
import css from "highlight.js/lib/languages/css";
import go from "highlight.js/lib/languages/go";
import java from "highlight.js/lib/languages/java";
import javascript from "highlight.js/lib/languages/javascript";
import json from "highlight.js/lib/languages/json";
import markdown from "highlight.js/lib/languages/markdown";
import php from "highlight.js/lib/languages/php";
import python from "highlight.js/lib/languages/python";
import ruby from "highlight.js/lib/languages/ruby";
import rust from "highlight.js/lib/languages/rust";
import sql from "highlight.js/lib/languages/sql";
import typescript from "highlight.js/lib/languages/typescript";
import xml from "highlight.js/lib/languages/xml";
import yaml from "highlight.js/lib/languages/yaml";

// Registered against highlight.js's core build (not the full ~190-language
// bundle) to keep the app's bundle size down — a curated set of common
// languages, each already declaring its own common aliases (e.g. "js"/"jsx"
// for javascript, "html" for xml, "py" for python, "cs"/"c#" for csharp).
hljs.registerLanguage("javascript", javascript);
hljs.registerLanguage("typescript", typescript);
hljs.registerLanguage("python", python);
hljs.registerLanguage("bash", bash);
hljs.registerLanguage("json", json);
hljs.registerLanguage("css", css);
hljs.registerLanguage("xml", xml);
hljs.registerLanguage("java", java);
hljs.registerLanguage("c", c);
hljs.registerLanguage("cpp", cpp);
hljs.registerLanguage("csharp", csharp);
hljs.registerLanguage("go", go);
hljs.registerLanguage("rust", rust);
hljs.registerLanguage("ruby", ruby);
hljs.registerLanguage("php", php);
hljs.registerLanguage("sql", sql);
hljs.registerLanguage("yaml", yaml);
hljs.registerLanguage("markdown", markdown);

export interface HighlightedCode {
  html: string;
  language: string;
}

/**
 * Highlights `code` as `infoString` (a fenced code block's language, e.g.
 * "js" in ```js) if it names a recognized language; returns null otherwise
 * so the caller can fall back to plain, unhighlighted rendering.
 */
export function highlightCode(code: string, infoString: string | undefined): HighlightedCode | null {
  const language = infoString?.trim().split(/\s+/)[0]?.toLowerCase();
  if (!language || !hljs.getLanguage(language)) return null;
  const { value } = hljs.highlight(code, { language, ignoreIllegals: true });
  return { html: value, language };
}
