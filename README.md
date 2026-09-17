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

## Project structure

```
electron/   main process: window, file I/O, watcher, IPC handlers
shared/     types + pure logic shared by main and renderer (parsing, graph)
src/        renderer (React + TypeScript UI)
```
