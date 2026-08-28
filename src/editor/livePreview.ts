import { EditorState, Range } from "@codemirror/state";
import {
  Decoration,
  DecorationSet,
  EditorView,
  ViewPlugin,
  ViewUpdate,
  WidgetType,
} from "@codemirror/view";

export interface LivePreviewHandlers {
  onSelectTitle: (title: string) => void;
  onOpenExternal: (url: string) => void;
  /** Lowercased note titles that exist in the stack, for orphan-link styling. */
  noteTitles: Set<string>;
}

export const EXTERNAL_SCHEME_RE = /^(https?:|mailto:)/i;
const HEADING_RE = /^(#{1,6})(\s+)/;
const INLINE_CODE_RE = /`([^`]+)`/g;
const WIKILINK_RE = /\[\[([^\]|#]+)(?:#([^\]|]+))?(?:\|([^\]]+))?\]\]/g;
// eslint-disable-next-line no-useless-escape
const MARKDOWN_LINK_RE = /(?<!!)\[([^\]]*)\]\(([^)]+)\)/g;
const BOLD_RE = /\*\*([^*]+)\*\*|__([^_]+)__/g;
const ITALIC_RE = /(?<!\*)\*([^*]+)\*(?!\*)|(?<!_)_([^_]+)_(?!_)/g;
const TAG_RE = /(?<![\w#/])#([a-zA-Z][\w-]*(?:\/[a-zA-Z][\w-]*)*)/g;

export function titleFromHref(href: string): string {
  const withoutHeader = href.split("#")[0];
  const base = withoutHeader.split(/[\\/]/).pop() ?? withoutHeader;
  return base.replace(/\.md$/i, "");
}

function cursorOverlaps(state: EditorState, from: number, to: number): boolean {
  return state.selection.ranges.some((r) => r.from <= to && r.to >= from);
}

class PillWidget extends WidgetType {
  constructor(
    private readonly text: string,
    private readonly className: string,
    private readonly onClick?: () => void
  ) {
    super();
  }
  eq(other: PillWidget) {
    return other.text === this.text && other.className === this.className;
  }
  toDOM() {
    const span = document.createElement("span");
    span.className = this.className;
    span.textContent = this.text;
    if (this.onClick) {
      const handler = this.onClick;
      span.addEventListener("mousedown", (e) => {
        e.preventDefault();
        handler();
      });
    }
    return span;
  }
  ignoreEvent() {
    return false;
  }
}

const HIDE = Decoration.replace({});

function processLine(
  state: EditorState,
  lineText: string,
  lineFrom: number,
  items: Range<Decoration>[],
  handlers: LivePreviewHandlers
) {
  const consumed = new Array<boolean>(lineText.length).fill(false);
  const markConsumed = (s: number, e: number) => {
    for (let i = s; i < e; i++) consumed[i] = true;
  };
  const isFree = (s: number, e: number) => {
    for (let i = s; i < e; i++) if (consumed[i]) return false;
    return true;
  };

  const lineTo = lineFrom + lineText.length;

  // Headings: hide "# " marker unless the cursor is on this line.
  const headingMatch = HEADING_RE.exec(lineText);
  if (headingMatch) {
    const markerLen = headingMatch[0].length;
    markConsumed(0, markerLen);
    const level = headingMatch[1].length;
    const cursorOnLine = cursorOverlaps(state, lineFrom, lineTo);
    if (!cursorOnLine) {
      items.push(HIDE.range(lineFrom, lineFrom + markerLen));
    }
    items.push(Decoration.mark({ class: `cm-heading cm-heading-${level}` }).range(lineFrom, lineTo));
  }

  // Inline code
  for (const m of lineText.matchAll(INLINE_CODE_RE)) {
    const s = m.index!;
    const e = s + m[0].length;
    if (!isFree(s, e)) continue;
    markConsumed(s, e);
    const cursorHere = cursorOverlaps(state, lineFrom + s, lineFrom + e);
    if (!cursorHere) {
      items.push(HIDE.range(lineFrom + s, lineFrom + s + 1));
      items.push(HIDE.range(lineFrom + e - 1, lineFrom + e));
    }
    items.push(Decoration.mark({ class: "cm-inline-code" }).range(lineFrom + s + 1, lineFrom + e - 1));
  }

  // Wikilinks
  for (const m of lineText.matchAll(WIKILINK_RE)) {
    const s = m.index!;
    const e = s + m[0].length;
    if (!isFree(s, e)) continue;
    markConsumed(s, e);
    const target = m[1].trim();
    const alias = m[3]?.trim();
    const display = alias || target;
    const cursorHere = cursorOverlaps(state, lineFrom + s, lineFrom + e);
    if (cursorHere) {
      items.push(Decoration.mark({ class: "cm-link-raw" }).range(lineFrom + s, lineFrom + e));
    } else {
      const orphan = !handlers.noteTitles.has(target.toLowerCase());
      const className = orphan ? "cm-wikilink-pill cm-wikilink-pill-orphan" : "cm-wikilink-pill";
      items.push(
        Decoration.replace({
          widget: new PillWidget(display, className, () => handlers.onSelectTitle(target)),
        }).range(lineFrom + s, lineFrom + e)
      );
    }
  }

  // Markdown links
  for (const m of lineText.matchAll(MARKDOWN_LINK_RE)) {
    const s = m.index!;
    const e = s + m[0].length;
    if (!isFree(s, e)) continue;
    markConsumed(s, e);
    const href = m[2].trim();
    const display = m[1].trim() || href;
    const cursorHere = cursorOverlaps(state, lineFrom + s, lineFrom + e);
    if (cursorHere) {
      items.push(Decoration.mark({ class: "cm-link-raw" }).range(lineFrom + s, lineFrom + e));
    } else {
      const isExternal = EXTERNAL_SCHEME_RE.test(href);
      const onClick = isExternal
        ? () => handlers.onOpenExternal(href)
        : () => handlers.onSelectTitle(titleFromHref(href));
      items.push(
        Decoration.replace({ widget: new PillWidget(display, "cm-md-link-pill", onClick) }).range(
          lineFrom + s,
          lineFrom + e
        )
      );
    }
  }

  // Bold
  for (const m of lineText.matchAll(BOLD_RE)) {
    const s = m.index!;
    const e = s + m[0].length;
    if (!isFree(s, e)) continue;
    markConsumed(s, e);
    const cursorHere = cursorOverlaps(state, lineFrom + s, lineFrom + e);
    if (!cursorHere) {
      items.push(HIDE.range(lineFrom + s, lineFrom + s + 2));
      items.push(HIDE.range(lineFrom + e - 2, lineFrom + e));
    }
    items.push(Decoration.mark({ class: "cm-bold" }).range(lineFrom + s + 2, lineFrom + e - 2));
  }

  // Italic
  for (const m of lineText.matchAll(ITALIC_RE)) {
    const s = m.index!;
    const e = s + m[0].length;
    if (!isFree(s, e)) continue;
    markConsumed(s, e);
    const cursorHere = cursorOverlaps(state, lineFrom + s, lineFrom + e);
    if (!cursorHere) {
      items.push(HIDE.range(lineFrom + s, lineFrom + s + 1));
      items.push(HIDE.range(lineFrom + e - 1, lineFrom + e));
    }
    items.push(Decoration.mark({ class: "cm-italic" }).range(lineFrom + s + 1, lineFrom + e - 1));
  }

  // Tags — always shown as a pill, nothing to hide/reveal.
  for (const m of lineText.matchAll(TAG_RE)) {
    const s = m.index!;
    const e = s + m[0].length;
    if (!isFree(s, e)) continue;
    markConsumed(s, e);
    items.push(Decoration.mark({ class: "cm-tag" }).range(lineFrom + s, lineFrom + e));
  }
}

function buildDecorations(view: EditorView, handlers: LivePreviewHandlers): DecorationSet {
  const items: Range<Decoration>[] = [];
  const processedLines = new Set<number>();
  for (const { from, to } of view.visibleRanges) {
    let pos = from;
    while (pos <= to) {
      const line = view.state.doc.lineAt(pos);
      if (!processedLines.has(line.from)) {
        processedLines.add(line.from);
        processLine(view.state, line.text, line.from, items, handlers);
      }
      pos = line.to + 1;
    }
  }
  return Decoration.set(items, true);
}

export interface LinkSelectionRequest {
  x: number;
  y: number;
  text: string;
  apply: () => void;
}

// Lets a right-click on a selection turn it into a [[wikilink]] in place.
export function selectionLinkMenu(onRequest: (req: LinkSelectionRequest) => void) {
  return EditorView.domEventHandlers({
    contextmenu(event, view) {
      const sel = view.state.selection.main;
      if (sel.empty) return false;
      const text = view.state.sliceDoc(sel.from, sel.to);
      event.preventDefault();
      onRequest({
        x: event.clientX,
        y: event.clientY,
        text,
        apply: () => {
          view.dispatch({
            changes: { from: sel.from, to: sel.to, insert: `[[${text}]]` },
            selection: { anchor: sel.to + 4 },
          });
          view.focus();
        },
      });
      return true;
    },
  });
}

export function livePreview(handlers: LivePreviewHandlers) {
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;
      constructor(view: EditorView) {
        this.decorations = buildDecorations(view, handlers);
      }
      update(update: ViewUpdate) {
        if (update.docChanged || update.viewportChanged || update.selectionSet) {
          this.decorations = buildDecorations(update.view, handlers);
        }
      }
    },
    {
      decorations: (v) => v.decorations,
    }
  );
}
