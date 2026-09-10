import { EditorView } from "@codemirror/view";
import type { Note } from "@shared/types";
import {
  BLOCK_ID_RE,
  EXTERNAL_SCHEME_RE,
  HEADING_ID_RE,
  HEADING_RE,
  MARKDOWN_LINK_RE,
  WIKILINK_RE,
  titleFromHref,
} from "./livePreview";
import { appendBlockId, nextBlockId, scanNoteBlocks, type NoteBlock } from "./noteBlocks";
import {
  bodySpec,
  boldSpec,
  calloutSpec,
  citationSpec,
  codeBlockSpec,
  footnoteSpec,
  heading1Spec,
  heading2Spec,
  heading3Spec,
  heading4Spec,
  heading5Spec,
  heading6Spec,
  highlightSpec,
  horizontalRuleSpec,
  inlineCodeSpec,
  inlineMathSpec,
  italicSpec,
  linkCommandSpec,
  mathBlockSpec,
  orderedListSpec,
  quoteSpec,
  strikethroughSpec,
  subscriptSpec,
  superscriptSpec,
  taskListSpec,
  underlineSpec,
  unorderedListSpec,
} from "./listCommands";

export interface EditorContextMenuRequest {
  x: number;
  y: number;
  /** False when the selection is empty — Cut/Copy have nothing to act on. */
  hasSelection: boolean;
  cutSelection: () => void;
  copySelection: () => void;
  pasteClipboard: () => void;
  /** Opens the link picker; the text currently selected (if any) becomes the new link's display text. */
  insertLinkAction: { selectedText: string; insertNote: (title: string) => void; insertExternal: (url: string) => void };
  makeHeading1: () => void;
  makeHeading2: () => void;
  makeHeading3: () => void;
  makeHeading4: () => void;
  makeHeading5: () => void;
  makeHeading6: () => void;
  makeBody: () => void;
  /** Omit `language` for a plain, language-less block. */
  makeCodeBlock: (language?: string) => void;
  makeMathBlock: () => void;
  makeQuote: () => void;
  makeOrderedList: () => void;
  makeUnorderedList: () => void;
  makeTaskList: () => void;
  makeBold: () => void;
  makeItalic: () => void;
  makeUnderline: () => void;
  makeStrikethrough: () => void;
  makeSuperscript: () => void;
  makeSubscript: () => void;
  makeHighlight: () => void;
  makeInlineCode: () => void;
  makeInlineMath: () => void;
  insertFootnote: () => void;
  insertCitation: () => void;
  insertCallout: () => void;
  insertHorizontalRule: () => void;
  /** Present only when the right-click landed on a markdown link. */
  linkTitleAction?: { hasTitle: boolean; run: () => void };
  /** Present whenever the right-click landed on a wikilink or markdown link. */
  linkDisplayAction?: { run: () => void };
  /** Present only for a link that resolves to a note which has headings. */
  linkHeaderAction?: { options: LinkTargetOption[]; onSelect: (value: string) => void };
  /** Present only for a link that resolves to a note which has at least one block (heading, paragraph, or code block). */
  linkBlockAction?: { blocks: NoteBlock[]; onSelect: (block: NoteBlock) => Promise<void> };
  /** Present only when the right-click landed on a heading line. */
  headerIdAction?: { hasId: boolean; run: () => void };
  /** Present whenever the right-click landed on a non-blank line. */
  blockIdAction?: { hasId: boolean; run: () => void };
}

export interface LinkTargetOption {
  label: string;
  value: string;
}

const HEADING_LINE_RE = /^#{1,6}[ \t]+(.*)$/;

/** Scans a note's raw content for headings it could be linked to. */
function headingsOf(note: Note): LinkTargetOption[] {
  const headers: LinkTargetOption[] = [];
  for (const rawLine of note.content.split("\n")) {
    const headingMatch = HEADING_LINE_RE.exec(rawLine);
    if (headingMatch) {
      const text = headingMatch[1].replace(HEADING_ID_RE, "").trim();
      if (text) headers.push({ label: text, value: text });
    }
  }
  return headers;
}

interface MarkdownLinkMatch {
  start: number;
  end: number;
  href: string;
  hrefStart: number;
  hrefEnd: number;
  display: string;
  displayStart: number;
  displayEnd: number;
  title?: string;
  titleOffset?: number;
}

/** Finds the markdown link (if any) covering `offset` within `lineText`. */
function findMarkdownLinkAt(lineText: string, offset: number): MarkdownLinkMatch | undefined {
  for (const m of lineText.matchAll(MARKDOWN_LINK_RE)) {
    const start = m.index!;
    const end = start + m[0].length;
    if (offset < start || offset > end) continue;
    const display = m[1];
    const href = m[2];
    const title = m[3];
    const displayStart = start + 1;
    const displayEnd = displayStart + display.length;
    const hrefStart = displayEnd + 2; // skip "]("
    const hrefEnd = hrefStart + href.length;
    let titleOffset: number | undefined;
    if (title !== undefined) {
      titleOffset = start + m[0].indexOf(`"${title}"`) + 1;
    }
    return { start, end, href, hrefStart, hrefEnd, display, displayStart, displayEnd, title, titleOffset };
  }
  return undefined;
}

interface WikilinkMatch {
  start: number;
  end: number;
  target: string;
  header?: string;
  alias?: string;
  aliasStart?: number;
  aliasEnd?: number;
}

/** Finds the wikilink (if any) covering `offset` within `lineText`. */
function findWikilinkAt(lineText: string, offset: number): WikilinkMatch | undefined {
  for (const m of lineText.matchAll(WIKILINK_RE)) {
    const start = m.index!;
    const end = start + m[0].length;
    if (offset < start || offset > end) continue;
    const target = m[1].trim();
    const header = m[2]?.trim();
    const alias = m[3];
    let aliasStart: number | undefined;
    let aliasEnd: number | undefined;
    if (alias !== undefined) {
      const pipeIndex = m[0].lastIndexOf("|");
      aliasStart = start + pipeIndex + 1;
      aliasEnd = end - 2; // before the closing "]]"
    }
    return { start, end, target, header, alias, aliasStart, aliasEnd };
  }
  return undefined;
}

function linkTitleActionAt(view: EditorView, line: { text: string; from: number }, offset: number) {
  const link = findMarkdownLinkAt(line.text, offset);
  if (!link) return undefined;
  return {
    hasTitle: link.title !== undefined,
    run: () => {
      if (link.title !== undefined && link.titleOffset !== undefined) {
        const from = line.from + link.titleOffset;
        view.dispatch({ selection: { anchor: from, head: from + link.title.length } });
      } else {
        const insertAt = line.from + link.end - 1;
        view.dispatch({
          changes: { from: insertAt, to: insertAt, insert: ' ""' },
          selection: { anchor: insertAt + 2, head: insertAt + 2 },
        });
      }
      view.focus();
    },
  };
}

interface DocChange {
  from: number;
  to: number;
  insert: string;
}

/** Builds the change that rewrites a wikilink's "#header" segment (which also covers "#^block-id"), preserving target and alias. */
function wikilinkAnchorChange(line: { from: number }, link: WikilinkMatch, anchor: string): DocChange {
  const aliasPart = link.alias !== undefined ? `|${link.alias}` : "";
  const newText = `[[${link.target}#${anchor}${aliasPart}]]`;
  return { from: line.from + link.start, to: line.from + link.end, insert: newText };
}

/** Builds the change that rewrites a markdown link's href anchor ("#header" or "#^block-id"), preserving the base href. */
function markdownLinkAnchorChange(line: { from: number }, link: MarkdownLinkMatch, anchor: string): DocChange {
  const base = link.href.split("#")[0];
  return { from: line.from + link.hrefStart, to: line.from + link.hrefEnd, insert: `${base}#${anchor}` };
}

function setWikilinkAnchor(view: EditorView, line: { from: number }, link: WikilinkMatch, anchor: string) {
  view.dispatch({ changes: wikilinkAnchorChange(line, link, anchor) });
  view.focus();
}

function setMarkdownLinkAnchor(view: EditorView, line: { from: number }, link: MarkdownLinkMatch, anchor: string) {
  view.dispatch({ changes: markdownLinkAnchorChange(line, link, anchor) });
  view.focus();
}

/**
 * Builds the "Link to Block" action for a link that resolves to `target`: every
 * heading/paragraph/code block in `target` is offered, in document order, even
 * if it has no "^block-id" yet — picking one assigns it an id first (if needed)
 * before rewriting the current link's anchor. When the target is the note
 * currently open in `view`, both edits are folded into a single transaction on
 * the live document instead of a separate disk write, so the in-memory editor
 * state and the file never disagree about what was just typed.
 */
function linkBlockActionFor(
  view: EditorView,
  currentNotePath: string,
  target: Note,
  writeNote: (path: string, content: string) => Promise<void>,
  buildAnchorChange: (anchor: string) => DocChange
): EditorContextMenuRequest["linkBlockAction"] {
  const isSelf = target.path === currentNotePath;
  const targetContent = isSelf ? view.state.doc.toString() : target.content;
  const blocks = scanNoteBlocks(targetContent);
  if (blocks.length === 0) return undefined;
  return {
    blocks,
    onSelect: async (block) => {
      let id = block.blockId;
      const changes: DocChange[] = [];
      if (!id) {
        id = nextBlockId(blocks);
        if (isSelf) {
          changes.push({ from: block.insertAt, to: block.insertAt, insert: ` ^${id}` });
        } else {
          await writeNote(target.path, appendBlockId(targetContent, block.insertAt, id));
        }
      }
      changes.push(buildAnchorChange(`^${id}`));
      changes.sort((a, b) => a.from - b.from);
      view.dispatch({ changes });
      view.focus();
    },
  };
}

function linkActionsAt(
  view: EditorView,
  line: { text: string; from: number },
  offset: number,
  resolveNoteByTitle: (title: string) => Note | undefined,
  currentNotePath: string,
  writeNote: (path: string, content: string) => Promise<void>
): {
  linkDisplayAction?: EditorContextMenuRequest["linkDisplayAction"];
  linkHeaderAction?: EditorContextMenuRequest["linkHeaderAction"];
  linkBlockAction?: EditorContextMenuRequest["linkBlockAction"];
} {
  const wikilink = findWikilinkAt(line.text, offset);
  if (wikilink) {
    const displayAction = {
      run: () => {
        if (wikilink.alias !== undefined && wikilink.aliasStart !== undefined && wikilink.aliasEnd !== undefined) {
          const from = line.from + wikilink.aliasStart;
          view.dispatch({ selection: { anchor: from, head: line.from + wikilink.aliasEnd } });
        } else {
          const insertAt = line.from + wikilink.end - 2;
          view.dispatch({
            changes: { from: insertAt, to: insertAt, insert: "|" },
            selection: { anchor: insertAt + 1, head: insertAt + 1 },
          });
        }
        view.focus();
      },
    };
    const target = resolveNoteByTitle(wikilink.target);
    if (!target) return { linkDisplayAction: displayAction };
    const headers = headingsOf(target);
    return {
      linkDisplayAction: displayAction,
      linkHeaderAction:
        headers.length > 0
          ? { options: headers, onSelect: (value) => setWikilinkAnchor(view, line, wikilink, value) }
          : undefined,
      linkBlockAction: linkBlockActionFor(view, currentNotePath, target, writeNote, (anchor) =>
        wikilinkAnchorChange(line, wikilink, anchor)
      ),
    };
  }

  const mdLink = findMarkdownLinkAt(line.text, offset);
  if (mdLink) {
    const displayAction = {
      run: () => {
        view.dispatch({ selection: { anchor: line.from + mdLink.displayStart, head: line.from + mdLink.displayEnd } });
        view.focus();
      },
    };
    const base = mdLink.href.split("#")[0];
    if (EXTERNAL_SCHEME_RE.test(base)) return { linkDisplayAction: displayAction };
    const target = resolveNoteByTitle(titleFromHref(base));
    if (!target) return { linkDisplayAction: displayAction };
    const headers = headingsOf(target);
    return {
      linkDisplayAction: displayAction,
      linkHeaderAction:
        headers.length > 0
          ? { options: headers, onSelect: (value) => setMarkdownLinkAnchor(view, line, mdLink, value) }
          : undefined,
      linkBlockAction: linkBlockActionFor(view, currentNotePath, target, writeNote, (anchor) =>
        markdownLinkAnchorChange(line, mdLink, anchor)
      ),
    };
  }

  return {};
}

function headerIdActionAt(view: EditorView, line: { text: string; from: number; to: number }) {
  if (!HEADING_RE.test(line.text)) return undefined;
  const idMatch = HEADING_ID_RE.exec(line.text);
  return {
    hasId: !!idMatch,
    run: () => {
      if (idMatch) {
        const idStart = line.from + idMatch.index! + idMatch[0].indexOf("#") + 1;
        view.dispatch({ selection: { anchor: idStart, head: idStart + idMatch[1].length } });
      } else {
        const insertAt = line.to;
        view.dispatch({
          changes: { from: insertAt, to: insertAt, insert: " {#}" },
          selection: { anchor: insertAt + 3, head: insertAt + 3 },
        });
      }
      view.focus();
    },
  };
}

function blockIdActionAt(view: EditorView, line: { text: string; from: number; to: number }) {
  if (!line.text.trim()) return undefined;
  const idMatch = BLOCK_ID_RE.exec(line.text);
  return {
    hasId: !!idMatch,
    run: () => {
      if (idMatch) {
        const idStart = line.from + idMatch.index! + idMatch[0].indexOf("^") + 1;
        view.dispatch({ selection: { anchor: idStart, head: idStart + idMatch[1].length } });
      } else {
        const insertAt = line.to;
        view.dispatch({
          changes: { from: insertAt, to: insertAt, insert: " ^" },
          selection: { anchor: insertAt + 2, head: insertAt + 2 },
        });
      }
      view.focus();
    },
  };
}

/**
 * Replaces the browser's native context menu with ours whenever right-clicking
 * inside the editor (in edit mode — this extension is only attached to the
 * CodeMirror instance, not the read-only preview), regardless of selection state.
 */
export function editorContextMenu(
  onRequest: (req: EditorContextMenuRequest) => void,
  resolveNoteByTitle: (title: string) => Note | undefined,
  currentNotePath: string,
  writeNote: (path: string, content: string) => Promise<void>
) {
  return EditorView.domEventHandlers({
    contextmenu(event, view) {
      event.preventDefault();
      const apply = (spec: ReturnType<typeof linkCommandSpec>) => {
        view.dispatch(spec);
        view.focus();
      };
      const { from, to } = view.state.selection.main;
      const clickPos = view.posAtCoords({ x: event.clientX, y: event.clientY });
      let linkTitleAction: EditorContextMenuRequest["linkTitleAction"];
      let headerIdAction: EditorContextMenuRequest["headerIdAction"];
      let blockIdAction: EditorContextMenuRequest["blockIdAction"];
      let linkDisplayAction: EditorContextMenuRequest["linkDisplayAction"];
      let linkHeaderAction: EditorContextMenuRequest["linkHeaderAction"];
      let linkBlockAction: EditorContextMenuRequest["linkBlockAction"];
      if (clickPos != null) {
        const line = view.state.doc.lineAt(clickPos);
        const offset = clickPos - line.from;
        linkTitleAction = linkTitleActionAt(view, line, offset);
        headerIdAction = headerIdActionAt(view, line);
        blockIdAction = blockIdActionAt(view, line);
        ({ linkDisplayAction, linkHeaderAction, linkBlockAction } = linkActionsAt(
          view,
          line,
          offset,
          resolveNoteByTitle,
          currentNotePath,
          writeNote
        ));
      }
      onRequest({
        x: event.clientX,
        y: event.clientY,
        hasSelection: from !== to,
        cutSelection: () => {
          const text = view.state.sliceDoc(from, to);
          if (!text) return;
          navigator.clipboard.writeText(text).then(() => {
            view.dispatch({ changes: { from, to, insert: "" } });
            view.focus();
          });
        },
        copySelection: () => {
          const text = view.state.sliceDoc(from, to);
          if (!text) return;
          navigator.clipboard.writeText(text).then(() => view.focus());
        },
        pasteClipboard: () => {
          navigator.clipboard.readText().then((text) => {
            view.dispatch(view.state.replaceSelection(text));
            view.focus();
          });
        },
        insertLinkAction: {
          selectedText: view.state.sliceDoc(from, to),
          insertNote: (title: string) => {
            const selectedText = view.state.sliceDoc(from, to);
            const text = selectedText ? `[[${title}|${selectedText}]]` : `[[${title}]]`;
            view.dispatch({ changes: { from, to, insert: text }, selection: { anchor: from + text.length } });
            view.focus();
          },
          insertExternal: (url: string) => {
            const selectedText = view.state.sliceDoc(from, to);
            const text = `[${selectedText || url}](${url})`;
            view.dispatch({ changes: { from, to, insert: text }, selection: { anchor: from + text.length } });
            view.focus();
          },
        },
        makeHeading1: () => apply(heading1Spec(view.state)),
        makeHeading2: () => apply(heading2Spec(view.state)),
        makeHeading3: () => apply(heading3Spec(view.state)),
        makeHeading4: () => apply(heading4Spec(view.state)),
        makeHeading5: () => apply(heading5Spec(view.state)),
        makeHeading6: () => apply(heading6Spec(view.state)),
        makeBody: () => apply(bodySpec(view.state)),
        makeCodeBlock: (language?: string) => apply(codeBlockSpec(view.state, language)),
        makeMathBlock: () => apply(mathBlockSpec(view.state)),
        makeQuote: () => apply(quoteSpec(view.state)),
        makeOrderedList: () => apply(orderedListSpec(view.state)),
        makeUnorderedList: () => apply(unorderedListSpec(view.state)),
        makeTaskList: () => apply(taskListSpec(view.state)),
        makeBold: () => apply(boldSpec(view.state)),
        makeItalic: () => apply(italicSpec(view.state)),
        makeUnderline: () => apply(underlineSpec(view.state)),
        makeStrikethrough: () => apply(strikethroughSpec(view.state)),
        makeSuperscript: () => apply(superscriptSpec(view.state)),
        makeSubscript: () => apply(subscriptSpec(view.state)),
        makeHighlight: () => apply(highlightSpec(view.state)),
        makeInlineCode: () => apply(inlineCodeSpec(view.state)),
        makeInlineMath: () => apply(inlineMathSpec(view.state)),
        insertFootnote: () => apply(footnoteSpec(view.state)),
        insertCitation: () => apply(citationSpec(view.state)),
        insertCallout: () => apply(calloutSpec(view.state)),
        insertHorizontalRule: () => apply(horizontalRuleSpec(view.state)),
        linkTitleAction,
        linkDisplayAction,
        linkHeaderAction,
        linkBlockAction,
        headerIdAction,
        blockIdAction,
      });
      return true;
    },
  });
}
