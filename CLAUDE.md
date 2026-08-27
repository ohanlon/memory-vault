# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Cairn: an Electron + React + TypeScript desktop app for browsing and
editing a folder of markdown notes as a linked graph — a local-first,
Obsidian-style alternative aimed at managing Claude memory files, but usable
for any `[[wikilink]]`-based markdown stack. Notes are always plain `.md`
files on disk; nothing is stored in a database, so other tools (including
Claude Code editing the same folder) can read/write them directly and the
app just reflects whatever's on disk.

## Commands

```bash
npm run dev              # Vite + Electron, hot reload
npm run typecheck        # tsc --noEmit for both renderer and main/electron configs
npm test                 # vitest run (all tests)
npx vitest run path/to/file.test.ts   # run a single test file
npx vitest run -t "test name"         # run tests matching a name
npm run build             # typecheck, build, package with electron-builder
npm run build:unpack      # same but --dir (skip installer, faster local build)
```

There is no lint script configured.

## Architecture

Three top-level source directories, each with a distinct role:

- `electron/` — Electron **main process**. Window creation, all filesystem
  I/O, the `chokidar` file watcher, and every IPC handler. Nothing in here
  runs in the renderer.
- `shared/` — pure TypeScript logic with **no Electron or DOM dependency**,
  imported by both main and renderer: markdown parsing (`parseNote.ts`),
  graph construction (`buildGraph.ts`), and types (`types.ts`). This is
  where most of the business logic and its tests live.
- `src/` — the renderer (React UI): components, the CodeMirror-based editor
  extension, and stack state hooks.

### IPC boundary

`electron/preload.ts` exposes a single `window.memoryStack` object via
`contextBridge` (`contextIsolation: true`, `nodeIntegration: false`). Every
renderer-to-main call goes through this object — see
`src/electron.d.ts`/`electron/preload.ts` for the full API surface (stack
picking/loading, named-stack CRUD, note CRUD, `openExternal`, and the
`onFileChanged` watcher subscription). IPC channel names follow a
`domain:action` convention (`stack:load`, `stacks:add`, `shell:openExternal`,
etc.), handled in `electron/main.ts`.

**Because `window.memoryStack` only exists via the real preload bridge, the
app cannot be exercised in a plain browser tab without first stubbing it**,
and several stack-loading calls happen inside `useEffect` on mount — meaning
a stub injected after `navigate()` returns is often too late (the effect
has already thrown). This is a known, load-bearing testing constraint, not
a bug: don't add defensive `window.memoryStack &&` guards to production
code just to make manual browser testing easier.

### Note parsing and the graph model (`shared/`)

`parseNote.ts` turns raw markdown + frontmatter (via `gray-matter`) into a
`Note`, extracting:
- `[[wikilinks]]` (with `|alias` and `#header` variants)
- standard markdown links `[text](Note.md)`, resolved the same way as
  wikilinks (case-insensitive title match), with `https:`/`mailto:` links
  flagged `external: true` instead of resolved against stack notes
- tags, merged from frontmatter `tags:` **and** inline `#tag` in the body
- all extraction runs on content with fenced/inline code spans masked out
  first (`maskCodeSpans`), so a literal `` `[[Note]]` `` written as a syntax
  example doesn't become a real link/tag

`buildGraph.ts` turns a `Note[]` into `{ nodes, edges }`. Three distinct
node kinds share the same `GraphNode` shape, distinguished by flags:
plain notes, external URLs (`external: true`, id is the URL), and tag hubs
(`isTag: true`, id is `#tagname`, one hub node per distinct tag with an
edge from every note that carries it — this is what makes writing `#foo` in
one note automatically link it to every other note tagged `foo`).

### Editor (`src/editor/livePreview.ts`, `src/components/`)

Two independent rendering modes for a note's content, toggled per-tab in
`EditorPane.tsx`:
- **Live preview edit mode** (default): a CodeMirror 6 `ViewPlugin`
  (`livePreview.ts`) that decorates the raw document in place — headings/
  bold/italic/code render styled with markup hidden, `[[wikilinks]]` and
  markdown links become clickable pills, tags become pills — revealing raw
  markdown only where the cursor currently is. This duplicates small regex
  patterns from `shared/parseNote.ts` rather than importing it, deliberately,
  to keep `gray-matter` out of the renderer bundle.
- **Preview mode** (`MarkdownPreview.tsx`): fully rendered, read-only HTML
  via `marked` + `dompurify` (sanitized), toggled with the Edit/Preview
  button.

Editor layout is CSS-fragile: `@uiw/react-codemirror` wraps its output in a
theme div (`.cm-theme-dark`, since the app hardcodes `theme="dark"`) that
sits between `.editor-pane` and `.cm-editor`. Every element in that chain
needs `flex: 1; min-height: 0` or content silently overflows past the
visible pane with no scrollbar — see the `.editor-pane .cm-theme-dark` /
`.cm-editor` / `.cm-scroller` rules in `src/index.css` if touching editor
sizing.

### State (`src/stack/`)

- `useStack.ts` owns the named-stack list, the currently open stack's
  `root`/`notes`/`graph`, and re-derives the graph via `buildGraph` on every
  reload (including the debounced reload triggered by `onFileChanged`).
- `tabs.ts` is pure, Electron/React-free tab-list logic (add/remove/rename/
  reconcile-against-existing-notes), used by `App.tsx` and unit tested in
  isolation — this split exists specifically because `App.tsx`'s behavior
  can't be driven through a browser tab (see the IPC boundary note above).

### Testing

`vitest.config.ts` is **deliberately separate** from `vite.config.ts`: the
latter's `vite-plugin-electron-renderer` shims `node:fs` for the renderer
bundle, which breaks `electron/*.test.ts` files that import `node:fs`
directly to test main-process code (e.g. `stackRegistry.test.ts`). Don't
merge these configs.

Tests are colocated with source (`*.test.ts` next to the file it covers),
in `shared/`, `electron/`, and `src/stack/`. There is no UI/component test
runner configured — `src/components/` has no tests.
