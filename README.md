# Memory Vault

An open-source, local-first desktop app for browsing and editing a folder of
markdown notes as a linked graph — an internal alternative to Obsidian aimed
at managing Claude memory files, but usable for any `[[wikilink]]`-based
markdown vault.

Notes live as plain `.md` files on disk. Nothing is stored in a database, so
other tools (including Claude Code editing the same folder) can keep reading
and writing the files directly — the app just reflects whatever is on disk.

## Features (v1)

- Named vaults: save a folder under a unique name (case-insensitive) and
  pick it from a list next time, instead of re-browsing for the folder
- Open any folder as a vault; browse notes in a file tree
- Tabbed editing: open several notes at once, switch between them, close
  individual tabs — clicking a wikilink/backlink/graph node opens it as a
  new tab (or focuses it if already open) rather than replacing the current one
- Obsidian-style live preview editor: headings, bold/italic, inline code,
  wikilinks, markdown links, and tags render styled; raw markdown is
  revealed only where the cursor currently is, autosaved to disk
- Graph view of the vault: edges from `[[wikilinks]]`, standard markdown
  links (`[text](Note.md)`), external links (`https://`, `mailto:`), and
  tags (frontmatter `tags:` or inline `#tag`)
- Backlinks / outgoing-links panel for the active note
- New / rename / delete notes (rename rewrites `[[links]]` across the vault)
- Live sync: external edits to the vault folder (e.g. by Claude Code) update
  the file tree, editor, and graph automatically

## Getting started

```bash
npm install
npm run dev
```

This starts Vite and launches the Electron app pointed at the dev server.

## Scripts

- `npm run dev` — run in development with hot reload
- `npm run typecheck` — type-check the renderer and main processes
- `npm test` — run unit tests (wikilink/frontmatter parser, graph builder)
- `npm run build` — type-check, build, and package a distributable with
  `electron-builder`

## Project structure

```
electron/   main process: window, file I/O, watcher, IPC handlers
shared/     types + pure logic shared by main and renderer (parsing, graph)
src/        renderer (React + TypeScript UI)
```

## Link syntax

Wikilinks:

- `[[Note Title]]` — link to a note by title
- `[[Note Title|Alias]]` — link with custom display text
- `[[Note Title#Header]]` — link to a header within a note

Standard markdown links to a `.md` file also count as graph edges:

- `[Alias](Note Title.md)` — link by relative path, display text is required
  by markdown syntax
- `[Alias](Note Title.md#Header)` — with a header anchor
- Pure in-page anchors (`#section`) and links to non-`.md` files (images,
  etc.) are ignored

Both forms are resolved by matching the target against other notes' file
names (case-insensitive), same as Obsidian.

Wikilinks, markdown links, and tags are all ignored inside code — fenced
blocks (` ```...``` `) and inline spans (`` `...` ``) — so writing
`` `[[Note]]` `` as a syntax example in a note doesn't create a real link.

External links:

- `[Alias](https://example.com)` and `mailto:` links get their own node in
  the graph, distinct from vault notes (shown in green). They appear under
  "Links from here" for the note that references them but never gain
  backlinks of their own, since nothing outside the vault can link back.
- Clicking an external node or link opens it in your default browser/mail
  client.
- Any other URL scheme (`javascript:`, `data:`, `ftp:`, etc.) is ignored
  entirely — neither shown in the graph nor treated as a note link.

Tags:

- Tags come from frontmatter (`tags: [project]`) or an inline `#project`
  anywhere in the note body — both are equivalent and merge together.
- Each distinct tag gets its own hub node in the graph (shown in purple, id
  `#tagname`), with an edge from every note that carries it. Writing
  `#project` in a note automatically links it to every other note tagged
  `project`, with no explicit wikilink needed.
- A note's tags are listed in a dedicated "Tags" section in the sidebar,
  separate from its wikilink/markdown backlinks.
- `#123` (a bare number) and markdown headings (`# Heading`) are not treated
  as tags. A `#Header` inside a wikilink or markdown link anchor
  (`[[Note#Header]]`, `[text](Note.md#Header)`) is not treated as a tag
  either.

## Live preview editor

`src/editor/livePreview.ts` is a CodeMirror 6 extension that decorates the
document on every edit/selection change:

- Headings, `**bold**`, `*italic*`, and `` `inline code` `` render styled,
  with their markup characters hidden — revealed again only when the cursor
  is on that heading's line (headings) or inside that specific span (bold/
  italic/code).
- `[[wikilinks]]` and `[markdown links](Note.md)` render as clickable pills
  showing just the display text; clicking navigates to the note (or opens
  external links/mailto in your browser/mail client). Placing the cursor
  inside one reveals the raw markdown so you can edit it.
- `#tags` render as a pill inline; there's no raw form to hide since the
  tag text itself is what's displayed.

This only affects editor rendering — the file on disk always stores plain
markdown, so external edits (including by Claude Code) are unaffected.

## Named vaults

Vault name → folder mappings are stored in `vaults.json` in Electron's
[userData directory](https://www.electronjs.org/docs/latest/api/app#appgetpathname)
(`electron/vaultRegistry.ts`). Adding a vault whose name matches an existing
one case-insensitively (e.g. `"Work"` vs `"work"`) is rejected. Removing a
vault only deletes the mapping — the folder and its notes on disk are
untouched. Only one vault is open at a time; switching writes nothing to
the folder you're leaving.

## Out of scope for v1

Cloud sync, a plugin system, full-text search, and any programmatic API
(MCP or otherwise) for agents to write memories — v1's only interface is
the shared markdown files on disk.
