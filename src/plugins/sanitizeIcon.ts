import DOMPurify from "dompurify";

// A plugin's ribbon icon is third-party SVG injected into the host document,
// so it is sanitised here every time it's rendered (main only size-caps it).
// <style> and style="" are dropped as well: a stylesheet inside an inline
// SVG is global and could restyle the whole app. The result is forced to the
// ribbon's 16x16 size and to inherit the button's colour.
export function sanitizePluginIcon(raw: string): string | null {
  const clean = DOMPurify.sanitize(raw, {
    USE_PROFILES: { svg: true },
    FORBID_TAGS: ["style"],
    FORBID_ATTR: ["style"],
  });
  const template = document.createElement("template");
  template.innerHTML = clean;
  const svg = template.content.querySelector("svg");
  // Some DOM implementations lower-case SVG attribute names when parsing HTML.
  if (!svg || !(svg.getAttribute("viewBox") ?? svg.getAttribute("viewbox"))) return null;
  svg.setAttribute("width", "16");
  svg.setAttribute("height", "16");
  svg.setAttribute("fill", "currentColor");
  return svg.outerHTML;
}
