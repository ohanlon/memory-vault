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

Backlinks and tags are also readable outside the GUI via the CLI/MCP
`get_backlinks`/`get_tags` operations (see below) — `get_backlinks` mirrors
the sidebar's wikilink/markdown-backlinks section (tag-only relationships
excluded), and `get_tags` mirrors the sidebar's Tags section but for the
whole notes folder at once.

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

Properties are also readable/writable outside the GUI via the CLI/MCP
`get_properties`/`set_properties` operations (see below) — schema
validation applies there too, but is advisory only: an out-of-range value
is still saved, just reported back as a warning, the same as the
Properties panel.

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

### Access control

Being registered in `notesFolders.json` does not make a folder reachable
via the CLI/MCP — that's a separate, deny-by-default gate
(`electron/cliAccess.ts`, `<userData>/cli-access.json`), the same opt-in
philosophy as the plugin permission system (`electron/pluginPermissions.ts`)
applied to a different kind of caller. A folder must be explicitly granted
from its "..." menu in the notes-folder switcher ("Allow CLI/MCP access")
before any CLI/MCP operation can touch it; `list_folders` only shows
granted folders, and every other operation on an ungranted folder fails
with a clear error naming the missing grant. `add_folder` is the one
exception: it auto-grants the folder it just registered for the first time
(not one that already existed under a different name — that branch
deliberately does not grant, so a caller can't learn/guess an existing
folder's path and grant itself access to it just by calling `add_folder`
again with the same path). Removing a notes folder revokes its grant;
renaming one carries the grant over to the new name.

### Conflict handling

Nothing in Cairn locks a file while it's open, so two writers touching the
same note - the GUI editor, a CLI/MCP call, or a hand-edit - can still
collide. Two independent, non-overlapping protections cover this:

- **GUI**: `EditorPane.tsx` tracks the mtime and content it last knew to
  match disk (set on load and after every save it makes). If the active
  note's mtime moves without the editor being the one that moved it, and
  the editor has local edits that haven't been written back yet, it shows
  a conflict banner ("Keep my version" / "Reload from disk") instead of
  letting the next autosave silently overwrite whatever changed
  externally. If there are no local edits to lose, it just quietly picks
  up the external content instead of nagging. An unresolved conflict also
  blocks the "flush pending save on navigate away" path (see the comment
  in `EditorPane.tsx`), so switching tabs without resolving it leaves the
  external version on disk rather than risk clobbering it.
- **CLI/MCP**: `update_note`, `set_note`, `set_properties`, and
  `delete_note` accept an optional `expectedMtimeMs` (CLI:
  `--if-unmodified-since`; MCP: `ifUnmodifiedSince`) - the mtime from an
  earlier `get_note`/`get_properties` call. If the note's mtime has moved
  since, the write is rejected (`{ ok: false, conflict: true,
  currentMtimeMs }`) rather than performed. This is optional and
  per-call, not a lock: omitting it writes unconditionally as before, and
  it doesn't protect against a second CLI/MCP call racing in the (narrow)
  window between two calls that don't use it.

## Out of scope

Cloud sync — notes stay local; syncing them is left to whatever the user
layers on top (a synced folder, git, etc.). A plugin API exists for
extending the app itself (see `src/plugins/`).
