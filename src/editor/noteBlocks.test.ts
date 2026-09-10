import { describe, expect, it } from "vitest";
import { appendBlockId, nextBlockId, scanNoteBlocks } from "./noteBlocks";

describe("scanNoteBlocks", () => {
  it("splits headings, paragraphs, and code blocks in document order", () => {
    const content = ["# Title", "", "First paragraph.", "", "```js", "const x = 1;", "```", "", "Second paragraph."].join(
      "\n"
    );
    const blocks = scanNoteBlocks(content);
    expect(blocks.map((b) => b.type)).toEqual(["heading", "paragraph", "code", "paragraph"]);
    expect(blocks[0].summary).toBe("Title");
    expect(blocks[1].summary).toBe("First paragraph.");
    expect(blocks[2].summary).toBe("Code block (js)");
    expect(blocks[3].summary).toBe("Second paragraph.");
  });

  it("truncates a paragraph to its first 20 words with an ellipsis", () => {
    const words = Array.from({ length: 25 }, (_, i) => `word${i + 1}`);
    const content = words.join(" ");
    const blocks = scanNoteBlocks(content);
    expect(blocks[0].summary).toBe(words.slice(0, 20).join(" ") + "…");
  });

  it("does not truncate a paragraph of 20 words or fewer", () => {
    const words = Array.from({ length: 20 }, (_, i) => `word${i + 1}`);
    const content = words.join(" ");
    const blocks = scanNoteBlocks(content);
    expect(blocks[0].summary).toBe(words.join(" "));
  });

  it("strips a heading's {#id} attribute from its summary", () => {
    const blocks = scanNoteBlocks("## Title {#custom-id}");
    expect(blocks[0].summary).toBe("Title");
  });

  it("picks up an existing block id on a paragraph's last line", () => {
    const content = "Some text\nmore text ^my-id";
    const blocks = scanNoteBlocks(content);
    expect(blocks[0].blockId).toBe("my-id");
  });

  it("picks up an existing block id on a heading line", () => {
    const blocks = scanNoteBlocks("## Title ^head-id");
    expect(blocks[0].blockId).toBe("head-id");
  });

  it("picks up an existing block id on a code block's closing fence line", () => {
    const content = "```\ncode\n``` ^code-id";
    const blocks = scanNoteBlocks(content);
    expect(blocks[0].blockId).toBe("code-id");
  });

  it("leaves blockId undefined when none is present", () => {
    const blocks = scanNoteBlocks("Just a paragraph.");
    expect(blocks[0].blockId).toBeUndefined();
  });

  it("computes insertAt at the end of the block's last line", () => {
    const content = "Line one\nLine two";
    const blocks = scanNoteBlocks(content);
    expect(blocks[0].insertAt).toBe(content.length);
  });

  it("returns no blocks for empty or blank-only content", () => {
    expect(scanNoteBlocks("")).toEqual([]);
    expect(scanNoteBlocks("\n\n")).toEqual([]);
  });
});

describe("nextBlockId", () => {
  it("returns block-1 when no blocks have an id", () => {
    const blocks = scanNoteBlocks("One\n\nTwo");
    expect(nextBlockId(blocks)).toBe("block-1");
  });

  it("skips ids already used by existing blocks", () => {
    const blocks = scanNoteBlocks("One ^block-1\n\nTwo ^block-2");
    expect(nextBlockId(blocks)).toBe("block-3");
  });
});

describe("appendBlockId", () => {
  it("inserts the id, prefixed with a space and caret, at the given offset", () => {
    const content = "Hello world";
    expect(appendBlockId(content, content.length, "my-id")).toBe("Hello world ^my-id");
  });

  it("inserts mid-document without disturbing the rest of the content", () => {
    const content = "First line\nSecond line";
    const insertAt = "First line".length;
    expect(appendBlockId(content, insertAt, "abc")).toBe("First line ^abc\nSecond line");
  });
});
