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
  are picked up automatically — the app never owns the files.
- **Daily notes and templates** for recurring structure, and an optional
  typed-properties schema for frontmatter (Settings → Advanced) if you want
  validation beyond plain YAML.

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

## Command line

The packaged app (`cairn.exe`) can also run a single operation headlessly —
no window opens, and the process exits as soon as the command completes.
Each command prints a JSON result to stdout. In development, run the same
commands with `electron . <command> ...` instead of `cairn.exe <command> ...`.

- `add_folder <path> [--name NAME]` — registers `<path>` as a notes folder,
  creating the directory if it doesn't exist. If `<path>` is already a
  registered notes folder, reports its existing name instead of creating a
  duplicate. If the requested name is already taken by another notes
  folder, picks a new one (e.g. `"Notes 2"`) and reports it.
- `list_folders` — lists every registered notes folder's name and path.
- `get_notes --folder NAME [--subfolders]` — lists the `.md` files in the
  named notes folder. Top-level files only, unless `--subfolders` is given.
- `get_note --folder NAME <notePath>` — prints the contents of a note
  (path relative to the notes folder root), or reports that it doesn't
  exist.
- `add_note --folder NAME <title> [--subfolder PATH] [--content TEXT |
  --content-file PATH]` — creates a note with the given title and content,
  optionally inside `PATH` (created if missing). If the title collides
  with an existing note, picks a new name (e.g. `"Idea 1"`) and reports it.
- `set_note --folder NAME <notePath> (--content TEXT | --content-file
  PATH)` — creates or overwrites a note at an exact path (path relative to
  the notes folder root), no auto-renaming. Use this instead of `add_note`
  when you want to maintain a specific note (e.g. a memory file an agent
  keeps writing back to) rather than always creating a new one.
- `update_note --folder NAME <notePath> (--content TEXT | --content-file
  PATH) [--heading NAME]` — appends the text to an existing note (path
  relative to the notes folder root). By default appends at the end of the
  file, adding a newline first if it doesn't already end with one; with
  `--heading`, inserts at the end of that heading's section instead (its
  content, before the next heading of the same or shallower level), and
  reports if no heading matches. Reports if the note doesn't exist rather
  than creating it.
- `delete_note --folder NAME <notePath>` — deletes a note (path relative
  to the notes folder root). Reports if the note doesn't exist rather
  than erroring.
- `search_notes --folder NAME <query> [--regex] [--case-sensitive]
  [--whole-word]` — searches every note's contents (including subfolders)
  for `query`, returning matching lines grouped by note. `--whole-word`
  only applies in plain (non-regex) mode.

`--content-file` reads the note's text from a file instead of a shell
argument — useful for multiline text, which is awkward to pass as a single
`--content` argument (shell-dependent: e.g. `$'line one\nline two'` in Git
Bash, or `` "line one`nline two" `` in PowerShell).

```bash
cairn.exe add_folder ./my-notes --name "Work"
cairn.exe list_folders
cairn.exe get_notes --folder Work --subfolders
cairn.exe get_note --folder Work "Idea.md"
cairn.exe add_note --folder Work "Idea" --content "some text" --subfolder Projects
cairn.exe set_note --folder Work "Preferences.md" --content "## Preferences"
cairn.exe update_note --folder Work "Idea.md" --content-file ./more-text.txt
cairn.exe update_note --folder Work "Preferences.md" --content "- likes dark mode" --heading Preferences
cairn.exe search_notes --folder Work "dark mode"
cairn.exe delete_note --folder Work "Idea.md"
```

## MCP server

The same operations are also exposed as an MCP server, for agents (Claude
Desktop, Claude Code, etc.) to read and write a notes folder directly
instead of shelling out to the CLI. It's a standalone Node/stdio process —
`dist-electron/mcpServer.js`, built alongside the app by `npm run build` /
`npm run build:unpack` — and reads/writes the same `notesFolders.json`
registry and notes as the GUI and CLI.

Tools: `add_folder`, `list_folders`, `get_notes`, `get_note`, `add_note`,
`set_note`, `update_note`, `delete_note`, `search_notes` — one per CLI
command above, with the same behavior.

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
