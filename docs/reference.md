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

## Attachments

- Paste an image from the clipboard, or drag one onto the editor, and it's
  saved into a top-level `attachments/` folder at the notes folder root and
  a `![](path)` reference is inserted at the cursor — no manual file
  copying. A name collision is resolved by suffixing a number rather than
  overwriting (`electron/attachments.ts`).
- In Preview mode, a relative image reference like this renders as an
  actual `<img>`, resolved against the note's own location the same way a
  markdown link is (`electron/attachmentProtocol.ts`, `shared/attachmentPath.ts`)
  — a plain relative path can't otherwise resolve to an arbitrary,
  user-picked notes folder on disk. An image with its own URL scheme
  already (`https://...`, `data:...`) is left untouched.
- Live preview edit mode shows the raw `![](path)` markdown text rather than
  rendering the image inline — only the Preview toggle renders it.
- Attachments aren't notes: they don't appear in the sidebar's file tree,
  the graph, or the CLI/MCP note operations. Nothing currently deletes an
  attachment automatically when the last note referencing it is deleted or
  edited.
- Orphaned attachments (no note embeds them via `![](path)` anymore) can be
  found and removed via the CLI/MCP `get_orphaned_attachments`/
  `delete_orphaned_attachments` operations, or from the GUI's "..." menu on
  a notes folder ("Clean up unused attachments", `App.tsx`) — both share
  the same detection logic (`electron/attachments.ts`'s
  `findOrphanedAttachments`, which scans every note's raw body for image
  embeds via `shared/parseNote.ts`'s `extractImageEmbeds` and resolves each
  one the same way MarkdownPreview.tsx does). An embed via an external URL
  scheme doesn't count as a reference either way.

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

## Export

File → Export… (`src/components/ExportDialog.tsx`) turns the currently
open notes folder into one of three formats, all built by
`src/export/vaultExport.ts`:

- **Single Markdown file** — every note concatenated (sorted alphabetically
  by title, separated by `---`), verbatim. No rendering, so `[[wikilinks]]`
  and image references stay exactly as written — an image reference stays
  relative to wherever the original `attachments/` folder was, which won't
  travel with this one file.
- **Single HTML file** — every note rendered to HTML and bundled into one
  page: `[[wikilinks]]` and markdown links to another exported note become
  in-document `#slug` anchors instead (`shared/noteLinks.ts`'s
  `rewriteWikilinksForExport`/`rewriteNoteLinksForExport` — a linked note
  has no separate file to navigate to anymore, and an orphan wikilink just
  becomes its plain display text), and every attachment image is inlined as
  a `data:` URL (batch-read up front via `attachments:readManyAsDataUrls`,
  since `marked`'s render callbacks are synchronous). Reuses
  `MarkdownPreview.tsx`'s `marked` setup (parameterized on how an image src
  resolves) so code highlighting/tags/etc. render the same as in-app
  Preview. A `$$math block$$` renders via KaTeX's structure but without its
  own stylesheet (bundling it as a raw import broke the packaged renderer —
  see the comment on `EXPORT_STYLE`), so it uses fallback system fonts.
- **PDF** — the same HTML, printed via `webContents.printToPDF` in a
  hidden, disposable window (`electron/exportFiles.ts`).

`shared/noteLinks.ts` holds every pure link/tag helper (including the two
export rewrite functions) with **no** `gray-matter` dependency, unlike
`shared/parseNote.ts` (which re-exports all of it, plus the `gray-matter`-
dependent `parseNote()` itself) — `gray-matter`'s transitive `js-yaml`/
`esprima` do a runtime `require()` that crashes the sandboxed renderer
bundle, so anything imported from the renderer (like the export module)
must go through `noteLinks.ts` directly rather than through `parseNote.ts`.

## Notes folders

Notes folder name → path mappings are stored in `notesFolders.json` in
Electron's
[userData directory](https://www.electronjs.org/docs/latest/api/app#appgetpathname)
(`electron/notesFolderRegistry.ts`). Adding a notes folder whose name
matches an existing one case-insensitively (e.g. `"Work"` vs `"work"`) is
rejected. Removing a notes folder only deletes the mapping — the folder and
its notes on disk are untouched. Only one notes folder is open at a time;
switching writes nothing to the folder you're leaving.

The sidebar's file tree (`src/components/FileTree.tsx`) mirrors a note's
actual subfolder on disk — grouped via `src/notesFolder/fileTree.ts`'s
`buildFileTree`, folders before notes at each level, both alphabetical —
rather than showing every note in one flat list regardless of location.
This includes a subfolder created outside the GUI entirely, e.g. via the
CLI/MCP's `add_note --subfolder`. Each folder's collapsed/expanded state is
local UI state, not persisted across restarts.

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

`add_note`'s `template` option renders one of the notes folder's custom
file templates (see "Convert to Template" in the GUI, `.templates/*.md`) —
not the 3 fixed built-in templates the GUI's own "New Note" menu offers,
which have no CLI/MCP equivalent. `{{date}}`/`{{time}}`/`{{datetime}}` tags
always use this app's default formats here (`shared/appSettings.ts`'s
`DEFAULT_APP_SETTINGS`), regardless of what the GUI's Settings has them
configured to — a template's own `{{date:FORMAT}}` override still works.

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

### Version history

Every overwrite or delete of a note's body — from `set_note`, `update_note`,
`delete_note`, or a hand-edit saved from the GUI editor — records the
note's *previous* content as a timestamped snapshot (`electron/noteHistory.ts`).
Snapshots are throttled to at most one every 10 minutes per note (so a burst
of debounced autosaves while typing doesn't flood history) and capped at the
50 most recent per note, oldest pruned first. They're stored under Cairn's
own app data (`<userData>/history/`), keyed by a hash of the notes folder's
root path plus the note's relative path — never as files inside a notes
folder itself, so they don't show up in a synced folder or a `git status`
there. `set_properties` (frontmatter-only edits) does not snapshot.

`get_note_history` lists a note's snapshots (newest first, each with a
`timestamp`); `restore_note_version` overwrites the note with one of them,
itself snapshotting the note's current content first (bypassing the
throttle) so a restore is always undoable with another restore. Both accept
the same `expectedMtimeMs`/`--if-unmodified-since` optimistic-concurrency
guard as the write operations above.

In the GUI, the clock icon next to a note's Edit/Preview toggle
(`EditorPane.tsx`) opens a "Version History" panel (`HistoryPanel.tsx`)
listing the same snapshots with a preview and a "Restore this version"
button, over its own IPC handlers (`notesFolder:getNoteHistory`/
`readNoteHistoryVersion`/`restoreNoteVersion` in `electron/main.ts`) rather
than the CLI/MCP path, since the GUI's open notes folder may not be
CLI/MCP-access-granted.

## Out of scope

Cloud sync — notes stay local; syncing them is left to whatever the user
layers on top (a synced folder, git, etc.). A plugin API exists for
extending the app itself (see `src/plugins/`).
