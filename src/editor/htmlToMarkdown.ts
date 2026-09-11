// Best-effort HTML -> Markdown conversion for "Paste with Formatting" —
// covers the elements a browser or word processor is likely to put on the
// clipboard (headings, bold/italic/underline/strikethrough, links, lists,
// blockquotes, code). Anything unrecognized falls back to its plain text
// content, so the worst case is missing formatting rather than garbled or
// crashing output.

const INLINE_MARKS: Record<string, [string, string]> = {
  strong: ["**", "**"],
  b: ["**", "**"],
  em: ["*", "*"],
  i: ["*", "*"],
  u: ["<u>", "</u>"],
  ins: ["<u>", "</u>"],
  del: ["~~", "~~"],
  s: ["~~", "~~"],
  strike: ["~~", "~~"],
  code: ["`", "`"],
};

const SKIPPED_TAGS = new Set(["script", "style", "head", "meta", "link"]);

function collapseWhitespace(text: string): string {
  return text.replace(/[ \t\n\r]+/g, " ");
}

/** Renders an element's content as a single inline run (no block structure), for use inside a heading/paragraph/list item/etc. */
function inline(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) {
    return collapseWhitespace(node.textContent ?? "");
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return "";
  const el = node as Element;
  const tag = el.tagName.toLowerCase();
  if (SKIPPED_TAGS.has(tag)) return "";

  if (tag === "br") return "\n";
  if (tag === "a") {
    const href = el.getAttribute("href");
    const text = Array.from(el.childNodes).map(inline).join("").trim();
    return href && text ? `[${text}](${href})` : text;
  }
  if (tag === "img") {
    const alt = el.getAttribute("alt") ?? "";
    const src = el.getAttribute("src");
    return src ? `![${alt}](${src})` : "";
  }

  const inner = Array.from(el.childNodes).map(inline).join("");
  const mark = INLINE_MARKS[tag];
  if (!mark) return inner;
  const trimmed = inner.trim();
  if (!trimmed) return "";
  return `${mark[0]}${trimmed}${mark[1]}`;
}

/** True if `el` has any element child that renders as its own block (so it needs recursing into rather than flattened to one inline run). */
function hasBlockChild(el: Element): boolean {
  return Array.from(el.children).some((child) => BLOCK_TAGS.has(child.tagName.toLowerCase()));
}

const BLOCK_TAGS = new Set([
  "p",
  "div",
  "section",
  "article",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "ul",
  "ol",
  "li",
  "blockquote",
  "pre",
  "hr",
]);

function listItems(el: Element, ordered: boolean): string {
  const items = Array.from(el.children).filter((c) => c.tagName.toLowerCase() === "li");
  return items
    .map((item, i) => {
      const marker = ordered ? `${i + 1}. ` : "- ";
      const nestedList = item.querySelector(":scope > ul, :scope > ol");
      const ownText = Array.from(item.childNodes)
        .filter((c) => c !== nestedList)
        .map(inline)
        .join("")
        .trim();
      const nested = nestedList
        ? "\n" +
          listItems(nestedList, nestedList.tagName.toLowerCase() === "ol")
            .split("\n")
            .map((line) => `  ${line}`)
            .join("\n")
        : "";
      return `${marker}${ownText}${nested}`;
    })
    .join("\n");
}

/** Renders one node as a block (possibly multi-line), or null if it contributes nothing. */
function block(node: Node): string | null {
  if (node.nodeType === Node.TEXT_NODE) {
    const text = collapseWhitespace(node.textContent ?? "").trim();
    return text || null;
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return null;
  const el = node as Element;
  const tag = el.tagName.toLowerCase();
  if (SKIPPED_TAGS.has(tag)) return null;

  switch (tag) {
    case "h1":
    case "h2":
    case "h3":
    case "h4":
    case "h5":
    case "h6": {
      const text = Array.from(el.childNodes).map(inline).join("").trim();
      return text ? `${"#".repeat(Number(tag[1]))} ${text}` : null;
    }
    case "blockquote": {
      const inner = blockChildren(el).join("\n\n");
      return inner
        ? inner
            .split("\n")
            .map((line) => (line ? `> ${line}` : ">"))
            .join("\n")
        : null;
    }
    case "pre": {
      const codeEl = el.querySelector("code");
      const text = (codeEl ?? el).textContent?.replace(/\n$/, "") ?? "";
      return `\`\`\`\n${text}\n\`\`\``;
    }
    case "ul":
    case "ol":
      return listItems(el, tag === "ol") || null;
    case "hr":
      return "---";
    case "table":
      // Not supported — fall through to its text content rather than
      // attempting a markdown table, so a pasted spreadsheet still yields
      // something readable instead of being dropped.
      return collapseWhitespace(el.textContent ?? "").trim() || null;
    default: {
      if (hasBlockChild(el)) {
        const inner = blockChildren(el).join("\n\n");
        return inner || null;
      }
      const text = Array.from(el.childNodes).map(inline).join("").trim();
      return text || null;
    }
  }
}

function blockChildren(parent: Node): string[] {
  const out: string[] = [];
  for (const child of Array.from(parent.childNodes)) {
    const rendered = block(child);
    if (rendered) out.push(rendered);
  }
  return out;
}

export function htmlToMarkdown(html: string): string {
  const doc = new DOMParser().parseFromString(html, "text/html");
  return blockChildren(doc.body).join("\n\n").trim();
}
