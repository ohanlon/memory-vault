import { BLOCK_ID_RE, HEADING_ID_RE } from "./livePreview";

export type NoteBlockType = "heading" | "paragraph" | "code";

export interface NoteBlock {
  type: NoteBlockType;
  /** The full heading text, the first 20 words of a paragraph, or a language-labeled placeholder for a code block. */
  summary: string;
  /** The block's existing "^block-id", if the author already assigned one. */
  blockId?: string;
  /** Absolute offset, within the note's content, of the end of the block's last line — where a new "^block-id" would be appended. */
  insertAt: number;
}

const HEADING_LINE_RE = /^#{1,6}[ \t]+(.*)$/;
const FENCE_LINE_RE = /^```/;
const WORD_LIMIT = 20;

function summarizeParagraph(text: string): string {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const truncated = words.length > WORD_LIMIT;
  return words.slice(0, WORD_LIMIT).join(" ") + (truncated ? "…" : "");
}

/** Splits a note's raw content into the headings, paragraphs, and fenced code blocks it contains, in document order. */
export function scanNoteBlocks(content: string): NoteBlock[] {
  const lines = content.split("\n");
  const lineOffsets: number[] = [];
  let offset = 0;
  for (const line of lines) {
    lineOffsets.push(offset);
    offset += line.length + 1;
  }
  const endOfLine = (n: number) => lineOffsets[n] + lines[n].length;

  const blocks: NoteBlock[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    if (FENCE_LINE_RE.test(line.trim())) {
      const lang = /^```[ \t]*(\S+)?/.exec(line.trim())?.[1];
      let j = i + 1;
      while (j < lines.length && !FENCE_LINE_RE.test(lines[j].trim())) j++;
      const endLine = Math.min(j, lines.length - 1);
      blocks.push({
        type: "code",
        summary: lang ? `Code block (${lang})` : "Code block",
        blockId: BLOCK_ID_RE.exec(lines[endLine])?.[1],
        insertAt: endOfLine(endLine),
      });
      i = j + 1;
      continue;
    }

    const headingMatch = HEADING_LINE_RE.exec(line);
    if (headingMatch) {
      blocks.push({
        type: "heading",
        summary: headingMatch[1].replace(HEADING_ID_RE, "").trim(),
        blockId: BLOCK_ID_RE.exec(line)?.[1],
        insertAt: endOfLine(i),
      });
      i++;
      continue;
    }

    if (line.trim() === "") {
      i++;
      continue;
    }

    const start = i;
    let j = i;
    while (
      j < lines.length &&
      lines[j].trim() !== "" &&
      !HEADING_LINE_RE.test(lines[j]) &&
      !FENCE_LINE_RE.test(lines[j].trim())
    ) {
      j++;
    }
    const endLine = j - 1;
    blocks.push({
      type: "paragraph",
      summary: summarizeParagraph(lines.slice(start, endLine + 1).join(" ")),
      blockId: BLOCK_ID_RE.exec(lines[endLine])?.[1],
      insertAt: endOfLine(endLine),
    });
    i = j;
  }

  return blocks;
}

/** Picks a "block-N" id not already used by any block in the note. */
export function nextBlockId(blocks: NoteBlock[]): string {
  const existing = new Set(blocks.map((b) => b.blockId).filter((id): id is string => !!id));
  let n = 1;
  while (existing.has(`block-${n}`)) n++;
  return `block-${n}`;
}

/** Appends " ^id" after a block's last line, returning the note's new content. */
export function appendBlockId(content: string, insertAt: number, id: string): string {
  return `${content.slice(0, insertAt)} ^${id}${content.slice(insertAt)}`;
}
