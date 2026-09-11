import type { EditorView, Panel, ViewUpdate } from "@codemirror/view";
import { EditorSelection } from "@codemirror/state";
import {
  SearchQuery,
  closeSearchPanel,
  findNext,
  findPrevious,
  getSearchQuery,
  replaceAll,
  replaceNext,
  setSearchQuery,
} from "@codemirror/search";
import { computeReplacement, findMatchesInRange, nextMatch, previousMatch, type SearchMatch } from "./searchInSelection";

const DOWN_ARROW_PATHS = '<path d="M12 4V18"/><path d="M6 13L12 19L18 13"/>';
const UP_ARROW_PATHS = '<path d="M12 20V6"/><path d="M6 11L12 5L18 11"/>';
const IN_SELECTION_PATHS =
  '<path d="M4 8V5C4 4.4 4.4 4 5 4H8"/><path d="M16 4H19C19.6 4 20 4.4 20 5V8"/><path d="M20 16V19C20 19.6 19.6 20 19 20H16"/><path d="M8 20H5C4.4 20 4 19.6 4 19V16"/>';

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string> = {},
  children: (Node | string)[] = []
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
  for (const child of children) node.append(child);
  return node;
}

function svg(paths: string): string {
  return `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`;
}

function iconButton(iconPaths: string, label: string, onClick: () => void): HTMLButtonElement {
  const button = el("button", {
    type: "button",
    class: "cairn-search-icon-btn",
    "aria-label": label,
    title: label,
  });
  button.innerHTML = svg(iconPaths);
  button.addEventListener("click", onClick);
  return button;
}

/** A toggle rendered as a button (not a checkbox) so its pressed state is just a CSS attribute selector, not a hidden-input hack. */
function togglePill(content: string, label: string, onToggle: (pressed: boolean) => void): HTMLButtonElement {
  const button = el("button", {
    type: "button",
    class: "cairn-search-toggle",
    "aria-pressed": "false",
    "aria-label": label,
    title: label,
  });
  if (content.startsWith("<")) button.innerHTML = content;
  else button.textContent = content;
  button.addEventListener("click", () => {
    const pressed = button.getAttribute("aria-pressed") !== "true";
    button.setAttribute("aria-pressed", String(pressed));
    onToggle(pressed);
  });
  return button;
}

function isPressed(button: HTMLButtonElement): boolean {
  return button.getAttribute("aria-pressed") === "true";
}

/** Set right before opening the panel to have it start with the replace row visible; consumed (and cleared) on construction. */
const pendingReplaceOpen = new WeakSet<EditorView>();
/** Tracks the live panel per view so a second Find & Replace request can reveal the replace row on an already-open panel instead of re-creating it. */
const panelInstances = new WeakMap<EditorView, CairnSearchPanel>();

export function requestReplaceOnOpen(view: EditorView) {
  const panel = panelInstances.get(view);
  if (panel) panel.showReplace();
  else pendingReplaceOpen.add(view);
}

/** Hides the replace row on an already-open panel (a no-op if it's not open, since a freshly created panel already starts find-only). */
export function requestFindOnly(view: EditorView) {
  pendingReplaceOpen.delete(view);
  panelInstances.get(view)?.hideReplace();
}

/**
 * A from-scratch find/replace panel — built on top of @codemirror/search's
 * public query/cursor primitives (SearchQuery, SearchCursor, RegExpCursor)
 * rather than its bundled panel, so it can add an "in selection" scope that
 * the stock panel has no way to express: Next/Previous/Replace/Replace All
 * only look for matches inside a captured selection range instead of the
 * whole document.
 */
class CairnSearchPanel implements Panel {
  dom: HTMLElement;
  top = true;

  private view: EditorView;
  private query: SearchQuery;
  private scopeFrom: number | null = null;
  private scopeTo: number | null = null;

  private searchField: HTMLInputElement;
  private replaceField: HTMLInputElement;
  private replaceRow: HTMLElement;
  private caseToggle: HTMLButtonElement;
  private wordToggle: HTMLButtonElement;
  private regexToggle: HTMLButtonElement;
  private selectionToggle: HTMLButtonElement;

  constructor(view: EditorView) {
    this.view = view;
    this.query = getSearchQuery(view.state);

    this.searchField = el("input", {
      class: "cairn-search-field",
      placeholder: "Find",
      "aria-label": "Find",
      name: "search",
      "main-field": "true",
    });
    this.searchField.value = this.query.search;
    this.searchField.addEventListener("input", () => this.commit());
    this.searchField.addEventListener("keydown", (e) => {
      if (e.key !== "Enter") return;
      e.preventDefault();
      if (e.shiftKey) this.previous();
      else this.next();
    });

    this.replaceField = el("input", {
      class: "cairn-search-field",
      placeholder: "Replace",
      "aria-label": "Replace",
      name: "replace",
    });
    this.replaceField.value = this.query.replace;
    this.replaceField.addEventListener("input", () => this.commit());
    this.replaceField.addEventListener("keydown", (e) => {
      if (e.key !== "Enter") return;
      e.preventDefault();
      this.replaceOne();
    });

    this.caseToggle = togglePill("Aa", "Match case", () => this.commit());
    this.wordToggle = togglePill("ab", "Whole word", () => this.commit());
    this.regexToggle = togglePill(".*", "Regular expression", () => this.commit());
    this.selectionToggle = togglePill(svg(IN_SELECTION_PATHS), "In selection", (pressed) => this.toggleInSelection(pressed));
    this.caseToggle.setAttribute("aria-pressed", String(this.query.caseSensitive));
    this.wordToggle.setAttribute("aria-pressed", String(this.query.wholeWord));
    this.regexToggle.setAttribute("aria-pressed", String(this.query.regexp));

    const previousButton = iconButton(UP_ARROW_PATHS, "Previous match", () => this.previous());
    const nextButton = iconButton(DOWN_ARROW_PATHS, "Next match", () => this.next());

    const replaceOneButton = el("button", { type: "button", class: "cairn-search-text-btn" }, ["Replace"]);
    replaceOneButton.addEventListener("click", () => this.replaceOne());
    const replaceAllButton = el("button", { type: "button", class: "cairn-search-text-btn" }, ["Replace All"]);
    replaceAllButton.addEventListener("click", () => this.replaceAllMatches());

    const closeButton = el("button", {
      type: "button",
      class: "cairn-search-icon-btn cairn-search-close",
      "aria-label": "Close",
    });
    closeButton.textContent = "×";
    closeButton.addEventListener("click", () => closeSearchPanel(view));

    // The close button is a normal flex item at the start of the search row
    // (not absolutely positioned over it) so it sits at the dialog's
    // top-left and can never overlap the other buttons regardless of how
    // many of them there are.
    const searchRow = el("div", { class: "cairn-search-row" }, [
      this.searchField,
      this.caseToggle,
      this.wordToggle,
      this.regexToggle,
      this.selectionToggle,
      previousButton,
      nextButton,
      closeButton,
    ]);
    this.replaceRow = el("div", { class: "cairn-search-row" }, [this.replaceField, replaceOneButton, replaceAllButton]);

    this.dom = el("div", { class: "cairn-search-panel" }, [searchRow, this.replaceRow]);
    this.dom.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        closeSearchPanel(view);
      }
    });

    panelInstances.set(view, this);
    if (pendingReplaceOpen.has(view)) {
      pendingReplaceOpen.delete(view);
      this.showReplace();
    } else {
      this.replaceRow.style.display = "none";
    }
  }

  /** Reveals the replace row (a no-op if already visible) and focuses its field. */
  showReplace() {
    this.replaceRow.style.display = "";
    this.replaceField.focus();
  }

  /** Hides the replace row (a no-op if already hidden) and focuses the search field. */
  hideReplace() {
    this.replaceRow.style.display = "none";
    this.searchField.focus();
  }

  destroy() {
    panelInstances.delete(this.view);
  }

  update(update: ViewUpdate) {
    if (!update.docChanged || this.scopeFrom == null || this.scopeTo == null) return;
    this.scopeFrom = update.changes.mapPos(this.scopeFrom);
    this.scopeTo = update.changes.mapPos(this.scopeTo, 1);
  }

  private commit() {
    const query = new SearchQuery({
      search: this.searchField.value,
      caseSensitive: isPressed(this.caseToggle),
      regexp: isPressed(this.regexToggle),
      wholeWord: isPressed(this.wordToggle),
      replace: this.replaceField.value,
    });
    if (!query.eq(this.query)) {
      this.query = query;
      this.view.dispatch({ effects: setSearchQuery.of(query) });
    }
  }

  private toggleInSelection(pressed: boolean) {
    if (!pressed) {
      this.scopeFrom = null;
      this.scopeTo = null;
      return;
    }
    const sel = this.view.state.selection.main;
    if (sel.empty) {
      // Nothing to scope to — leave the toggle off rather than silently
      // pretending to restrict to an empty range.
      this.selectionToggle.setAttribute("aria-pressed", "false");
      return;
    }
    this.scopeFrom = sel.from;
    this.scopeTo = sel.to;
  }

  private scopedMatches(): SearchMatch[] {
    this.commit();
    const from = this.scopeFrom ?? 0;
    const to = this.scopeTo ?? this.view.state.doc.length;
    return findMatchesInRange(this.query, this.view.state, from, to);
  }

  private next() {
    if (this.scopeFrom == null) {
      findNext(this.view);
      return;
    }
    const match = nextMatch(this.scopedMatches(), this.view.state.selection.main.to);
    if (!match) return;
    this.view.dispatch({
      selection: EditorSelection.single(match.from, match.to),
      scrollIntoView: true,
      userEvent: "select.search",
    });
  }

  private previous() {
    if (this.scopeFrom == null) {
      findPrevious(this.view);
      return;
    }
    const match = previousMatch(this.scopedMatches(), this.view.state.selection.main.from);
    if (!match) return;
    this.view.dispatch({
      selection: EditorSelection.single(match.from, match.to),
      scrollIntoView: true,
      userEvent: "select.search",
    });
  }

  private replaceOne() {
    if (this.scopeFrom == null) {
      replaceNext(this.view);
      return;
    }
    if (this.view.state.readOnly) return;
    const matches = this.scopedMatches();
    const sel = this.view.state.selection.main;
    const current = matches.find((m) => m.from === sel.from && m.to === sel.to);
    if (current) {
      this.view.dispatch({
        changes: { from: current.from, to: current.to, insert: computeReplacement(this.query, current.match) },
        userEvent: "input.replace",
      });
    }
    this.next();
  }

  private replaceAllMatches() {
    if (this.scopeFrom == null) {
      replaceAll(this.view);
      return;
    }
    if (this.view.state.readOnly) return;
    const matches = this.scopedMatches();
    if (matches.length === 0) return;
    const changes = matches.map((m) => ({ from: m.from, to: m.to, insert: computeReplacement(this.query, m.match) }));
    this.view.dispatch({ changes, userEvent: "input.replace.all" });
  }
}

export function createSearchPanel(view: EditorView): Panel {
  return new CairnSearchPanel(view);
}
