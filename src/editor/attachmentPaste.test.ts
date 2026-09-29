import { describe, expect, it } from "vitest";
import { sanitizeFileName } from "./attachmentPaste";

describe("sanitizeFileName", () => {
  it("leaves a name with no whitespace unchanged", () => {
    expect(sanitizeFileName("screenshot.png")).toBe("screenshot.png");
  });

  it("replaces a space with a hyphen", () => {
    expect(sanitizeFileName("pasted image.png")).toBe("pasted-image.png");
  });

  it("collapses a run of whitespace into a single hyphen", () => {
    expect(sanitizeFileName("Screen Shot  2024-01-01 at 12.00.00.png")).toBe(
      "Screen-Shot-2024-01-01-at-12.00.00.png"
    );
  });
});
