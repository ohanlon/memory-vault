import { describe, expect, it } from "vitest";
import { EDITOR_FONT_OPTIONS, EDITOR_FONT_STACKS } from "./editorFonts";

describe("EDITOR_FONT_STACKS / EDITOR_FONT_OPTIONS", () => {
  it("has a font stack for every option, and no extras", () => {
    const optionValues = EDITOR_FONT_OPTIONS.map((opt) => opt.value).sort();
    const stackKeys = Object.keys(EDITOR_FONT_STACKS).sort();
    expect(stackKeys).toEqual(optionValues);
  });

  it("defaults to System Default first in the list", () => {
    expect(EDITOR_FONT_OPTIONS[0].value).toBe("system-ui");
  });
});
