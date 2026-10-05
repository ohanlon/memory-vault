// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { sanitizePluginIcon } from "./sanitizeIcon";

// happy-dom doesn't give parsed <svg> the SVG namespace, so DOMPurify drops
// the <svg> root there and a positive "keeps the shapes / strips scripts"
// test can't run in this environment. Those cases are verified against real
// Chromium instead (see the manual checks in the plugin conversion plan).
describe("sanitizePluginIcon", () => {
  it("rejects input that is not an svg", () => {
    expect(sanitizePluginIcon("<div>hi</div>")).toBeNull();
    expect(sanitizePluginIcon("")).toBeNull();
  });

  it("never lets script content through, whatever the DOM implementation does", () => {
    const out = sanitizePluginIcon('<svg viewBox="0 0 1 1"><script>alert(1)</script><path d="M0 0" onclick="x()"/></svg>');
    expect(out ?? "").not.toMatch(/script|onclick/i);
  });
});
