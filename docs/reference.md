# Reference

Detailed syntax and behavior notes for Cairn. See the [README](../README.md)
for a general introduction — this document assumes you already know what a
notes folder is.

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

Typing `[[` in the editor offers matching notes as you type; picking one
inserts the same syntax you'd get typing it by hand. Right-click →
"Insert Link" opens the same picker plus support for linking to an external
URL, useful when you have text selected to turn into a link.

## External links

- `[Alias](https://example.com)` and `mailto:` links get their own node in
  the graph, distinct from regular notes (shown in green). They appear under
  "Links from here" for the note that references them but never gain
  backlinks of their own, since nothing outside the notes folder can link back.
- Clicking an external node or link opens it in your default browser/mail
  client.
- Any other URL scheme (`javascript:`, `data:`, `ftp:`, etc.) is ignored
  entirely — neither shown in the graph nor treated as a note link.

## Tags

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

## Linking to a specific block

The "Link to Block" action (in a note's link picker) links to one paragraph,
heading, or code block rather than the whole note. Picking a block appends a
small marker like `^a1b2c3` after it in the note's plain-text content, so
the link keeps resolving to that spot even if the note is edited later.

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

## Notes folders

Notes folder name → path mappings are stored in `notesFolders.json` in
Electron's
[userData directory](https://www.electronjs.org/docs/latest/api/app#appgetpathname)
(`electron/notesFolderRegistry.ts`). Adding a notes folder whose name
matches an existing one case-insensitively (e.g. `"Work"` vs `"work"`) is
rejected. Removing a notes folder only deletes the mapping — the folder and
its notes on disk are untouched. Only one notes folder is open at a time;
switching writes nothing to the folder you're leaving.

## Properties

Frontmatter fields can optionally be constrained by a schema (Settings →
Advanced → "Manage properties…"): give a field a type (text, list, number,
checkbox, date, datetime) and validation rules, and Cairn will validate and
render an appropriate input for it in the Properties panel. Any frontmatter
field without a matching schema entry is still shown and editable as a
plain custom field — the schema is opt-in, not required.

## Programmatic access

Beyond the GUI, a notes folder can be read and written by agents/scripts
through two interfaces built on the same operations (`electron/cli.ts`):

- A standalone CLI executable, `cairn-cli.exe` (`node
  dist-electron/cliMain.cjs <command> ...` in development) — a separate,
  self-contained binary from the GUI app (`electron/cliMain.ts`, packaged
  via Node's Single Executable Applications feature, see
  `scripts/build-cli.mjs`) that doesn't require Node.js to be installed to
  run — see the README's Command line section.
- An MCP server (`dist-electron/mcpServer.js`, built alongside the app,
  `electron/mcpServer.ts`) that exposes the same operations as MCP tools
  over stdio, for agents like Claude Desktop or Claude Code to call
  directly. Unlike the CLI, this one does require the user to have Node.js
  installed, since it's launched via `node <path>` from the MCP client's
  own config — see the README's MCP server section.

Both interfaces operate on the same `notesFolders.json` registry and files
on disk as the GUI, so a folder registered by one is visible to the others.

## Out of scope

Cloud sync — notes stay local; syncing them is left to whatever the user
layers on top (a synced folder, git, etc.). A plugin API exists for
extending the app itself (see `src/plugins/`).
