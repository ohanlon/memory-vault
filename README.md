# Cairn

Cairn is a desktop app for writing notes as plain markdown files and seeing
how they connect. Type `[[` to link one note to another, add `#tags` to
group related notes without linking each one by hand, and Cairn draws the
result as a graph you can browse. Named after the stacks of stones hikers
use to mark a trail — it's meant to be a lighter-weight, local-first
alternative to Obsidian, originally built for keeping Claude's own memory
files but useful for any folder of linked notes.

There's no database: every note is a `.md` file on disk, so other tools
(including Claude Code editing the same folder) can read and write them
directly, and Cairn just reflects whatever's there.

## Getting started

```bash
npm install
npm run dev
```

This starts Vite and launches the Electron app pointed at the dev server.
The first time it opens, point it at a folder of markdown notes (or an
empty one to start fresh) — that becomes a notes folder.

## What it does

- **Link notes** by typing `[[note title]]` — autocomplete suggests
  matching notes as you type — or right-click → "Insert Link" for a picker
  that also handles external URLs.
- **See the connections** in a graph view: every wikilink, markdown link,
  external URL, and tag becomes an edge or node you can click through.
- **Group with tags**: adding `#project` to a note links it to every other
  note tagged `project`, no manual linking required.
- **Search and replace** across every note in a notes folder at once.
- **Stay in sync**: edits made outside Cairn (by hand, or by Claude Code)
  are picked up automatically — the app never owns the files. If an open
  note changes outside Cairn while you have unsaved edits to it, a banner
  lets you choose to keep your version or reload the external one, rather
  than silently overwriting either.
- **Daily notes and templates** for recurring structure, and an optional
  typed-properties schema for frontmatter (Settings → Advanced) if you want
  validation beyond plain YAML.
- **Version history**: every overwrite is snapshotted locally, so the clock
  icon next to a note's Edit/Preview toggle lets you browse and restore past
  versions.

See [docs/reference.md](docs/reference.md) for exact link syntax, the graph
model, and how notes folders are stored on disk.

## Scripts

- `npm run dev` — run in development with hot reload
- `npm run typecheck` — type-check the renderer and main processes
- `npm test` — run unit tests
- `npm run build` — type-check, build, and package a distributable with
  `electron-builder`
- `npm run build:unpack` — same, but skips the installer step for a faster
  local build
- `npm run build:cli` — packages `dist-electron/cliMain.cjs` (already built
  by the two commands above) into the standalone `release/cairn-cli.exe`;
  also runs automatically as the last step of `build`/`build:unpack`

## Command line

`cairn-cli.exe` is a separate, self-contained executable for scripting —
it shares no process with the GUI app, doesn't open a window, and doesn't
require Node.js to be installed (it's built with Node's Single Executable
Applications feature, so it embeds its own Node runtime). It reads/writes
the same `notesFolders.json` registry and notes as the GUI. Each command
prints a JSON result to stdout. In development, skip the packaging step
and run `node dist-electron/cliMain.cjs <command> ...` after `npx vite
build` instead.

**Access is deny-by-default, per notes folder.** Being registered in the
GUI doesn't make a folder reachable via the CLI/MCP — it must be explicitly
granted from that folder's "..." menu ("Allow CLI/MCP access") before any
command below can touch it; an ungranted folder is invisible to
`list_folders` and every other command reports it as not granted. The one
exception: `add_folder` auto-grants access to a folder it registers for the
first time (not one that was already registered under a different name),
since whatever called it already has CLI/MCP access by definition.

- `add_folder <path> [--name NAME]` — registers `<path>` as a notes folder,
  creating the directory if it doesn't exist, and grants it CLI/MCP access
  (see above). If `<path>` is already a registered notes folder, reports
  its existing name instead of creating a duplicate (and does not change
  its access). If the requested name is already taken by another notes
  folder, picks a new one (e.g. `"Notes 2"`) and reports it.
- `list_folders` — lists every notes folder that has been granted CLI/MCP
  access (registered folders without that grant are omitted).
- `get_notes --folder NAME [--subfolders]` — lists the `.md` files in the
  named notes folder. Top-level files only, unless `--subfolders` is given.
- `get_note --folder NAME <notePath>` — prints the contents of a note
  (path relative to the notes folder root) and its `mtimeMs`, or reports
  that it doesn't exist. Pass that `mtimeMs` back as `--if-unmodified-since`
  to a later write on the same note to avoid clobbering a change made in
  between (see below).
- `add_note --folder NAME <title> [--subfolder PATH] [--content TEXT |
  --content-file PATH]` — creates a note with the given title and content,
  optionally inside `PATH` (created if missing). If the title collides
  with an existing note, picks a new name (e.g. `"Idea 1"`) and reports it.
- `set_note --folder NAME <notePath> (--content TEXT | --content-file
  PATH) [--if-unmodified-since MTIME_MS]` — creates or overwrites a note at
  an exact path (path relative to the notes folder root), no auto-renaming.
  Use this instead of `add_note` when you want to maintain a specific note
  (e.g. a memory file an agent keeps writing back to) rather than always
  creating a new one.
- `update_note --folder NAME <notePath> (--content TEXT | --content-file
  PATH) [--heading NAME] [--if-unmodified-since MTIME_MS]` — appends the
  text to an existing note (path relative to the notes folder root). By
  default appends at the end of the file, adding a newline first if it
  doesn't already end with one; with `--heading`, inserts at the end of
  that heading's section instead (its content, before the next heading of
  the same or shallower level), and reports if no heading matches. Reports
  if the note doesn't exist rather than creating it.
- `delete_note --folder NAME <notePath> [--if-unmodified-since MTIME_MS]` —
  deletes a note (path relative to the notes folder root). Reports if the
  note doesn't exist rather than erroring.
- `search_notes --folder NAME <query> [--regex] [--case-sensitive]
  [--whole-word]` — searches every note's contents (including subfolders)
  for `query`, returning matching lines grouped by note. `--whole-word`
  only applies in plain (non-regex) mode.
- `get_properties --folder NAME <notePath>` — returns a note's frontmatter
  and `mtimeMs` (path relative to the notes folder root), or reports that
  the note doesn't exist.
- `set_properties --folder NAME <notePath> --json '{"key":"value",...}'
  [--if-unmodified-since MTIME_MS]` — merges the given object into the
  note's existing frontmatter (a key not mentioned is left alone; a key
  set to `null` is removed). If the notes folder has a property schema
  (Settings → Advanced → "Manage properties…"), an out-of-range/invalid
  value is still saved but reported back under `warnings`, matching the
  GUI Properties panel's own advisory-only validation.

**`--if-unmodified-since MTIME_MS`** (on `set_note`, `update_note`,
`delete_note`, `set_properties`) is optional optimistic concurrency:
if you captured a note's `mtimeMs` from an earlier `get_note`/
`get_properties` call and pass it back here, the write is rejected
(`{ "ok": false, "conflict": true, "currentMtimeMs": ... }`, nothing is
written) if the note changed since — whether from the GUI, another
CLI/MCP call, or a hand-edit — instead of silently overwriting it.
Omit it to write unconditionally, as before. `set_note` ignores it when
the note doesn't exist yet, since there's nothing to conflict with.
- `get_backlinks --folder NAME <notePath>` — lists notes that
  wikilink/markdown-link to this note (path relative to the notes folder
  root), resolved the same case-insensitive way as the GUI's graph.
  Doesn't include notes that only share a tag — see `get_tags` for that.
- `get_tags --folder NAME` — lists every tag in the notes folder, each with
  the notes (relative paths) that carry it, from frontmatter `tags:` and
  inline `#tag` alike.
- `get_note_history --folder NAME <notePath>` — lists local version
  snapshots recorded for a note (newest first), each with a `timestamp` you
  can pass to `restore_note_version`. A snapshot of a note's previous
  content is recorded automatically whenever it's overwritten or deleted —
  by `set_note`, `update_note`, `delete_note`, or a hand-edit saved from the
  GUI — throttled to at most one every 10 minutes per note (so a burst of
  autosaves while typing doesn't flood history), capped at the 50 most
  recent per note. Snapshots live outside any notes folder (under Cairn's
  own app data), not as files a sync tool or `git` would ever see.
- `restore_note_version --folder NAME <notePath> --timestamp ISO_TIMESTAMP
  [--if-unmodified-since MTIME_MS]` — overwrites the note with a snapshot
  from `get_note_history`. The note's current content is itself snapshotted
  first (bypassing the usual throttle), so a restore can always be undone
  with another restore.

`--content-file` reads the note's text from a file instead of a shell
argument — useful for multiline text, which is awkward to pass as a single
`--content` argument (shell-dependent: e.g. `$'line one\nline two'` in Git
Bash, or `` "line one`nline two" `` in PowerShell).

```bash
cairn-cli.exe add_folder ./my-notes --name "Work"
cairn-cli.exe list_folders
cairn-cli.exe get_notes --folder Work --subfolders
cairn-cli.exe get_note --folder Work "Idea.md"
cairn-cli.exe add_note --folder Work "Idea" --content "some text" --subfolder Projects
cairn-cli.exe set_note --folder Work "Preferences.md" --content "## Preferences"
cairn-cli.exe update_note --folder Work "Idea.md" --content-file ./more-text.txt
cairn-cli.exe update_note --folder Work "Preferences.md" --content "- likes dark mode" --heading Preferences
cairn-cli.exe search_notes --folder Work "dark mode"
cairn-cli.exe delete_note --folder Work "Idea.md"
cairn-cli.exe set_properties --folder Work "Idea.md" --json '{"status":"active","priority":2}'
cairn-cli.exe get_properties --folder Work "Idea.md"
cairn-cli.exe get_backlinks --folder Work "Idea.md"
cairn-cli.exe get_tags --folder Work
cairn-cli.exe update_note --folder Work "Idea.md" --content "more text" --if-unmodified-since 1737496200000
cairn-cli.exe get_note_history --folder Work "Idea.md"
cairn-cli.exe restore_note_version --folder Work "Idea.md" --timestamp 2026-01-01T10:00:00.000Z
```

## MCP server

The same operations are also exposed as an MCP server, for agents (Claude
Desktop, Claude Code, etc.) to read and write a notes folder directly
instead of shelling out to the CLI. It's a standalone Node/stdio process —
`dist-electron/mcpServer.js`, built alongside the app by `npm run build` /
`npm run build:unpack` — and reads/writes the same `notesFolders.json`
registry and notes as the GUI and CLI.

Tools: `add_folder`, `list_folders`, `get_notes`, `get_note`, `add_note`,
`set_note`, `update_note`, `delete_note`, `search_notes`, `get_properties`,
`set_properties`, `get_backlinks`, `get_tags`, `get_note_history`,
`restore_note_version` — one per CLI command above, with the same behavior,
including the same deny-by-default per-folder access control described
above.

Point an MCP client at it with `node`, e.g. in Claude Code's `.mcp.json` or
Claude Desktop's config:

```json
{
  "mcpServers": {
    "cairn": {
      "command": "node",
      "args": ["/absolute/path/to/dist-electron/mcpServer.js"]
    }
  }
}
```

## Project structure

```
electron/   main process: window, file I/O, watcher, IPC handlers
shared/     types + pure logic shared by main and renderer (parsing, graph)
src/        renderer (React + TypeScript UI)
```
