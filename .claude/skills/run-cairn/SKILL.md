---
name: run-cairn
description: Build, run, and drive Cairn (the Electron desktop app in this repo). Use when asked to start Cairn, launch the app, take a screenshot of its UI, click through a flow, or verify a GUI change actually works end-to-end.
---

Cairn is an Electron desktop app (see the top-level `CLAUDE.md`). It's driven
via `.claude/skills/run-cairn/driver.mjs`, a batch script over Playwright's
`_electron` API — no xvfb/tmux needed here since this runs on a real Windows
desktop with a display, not headless CI. All paths below are relative to the
repo root.

## Prerequisites

`playwright` is already a devDependency (added for this skill) — `npm install`
covers it. No OS packages needed on Windows with a real display.

## Build

```bash
npm run build:unpack
```

Produces `release/win-unpacked/cairn.exe`, which the driver launches by
default. Re-run this after any change to `electron/`, `src/`, or `shared/`
before driving the app, since the driver launches the packaged build, not
a live dev server.

## Run (agent path)

Pipe a batch of commands into the driver via a heredoc. Each invocation
launches the app fresh and closes it at the end (or on an explicit `quit`) —
there's no persistent session across separate invocations, so put an entire
scenario in one heredoc.

```bash
node .claude/skills/run-cairn/driver.mjs - <<'EOF'
launch
wait 1000
ss out/01-picker.png
click text=Work
wait 1200
ss out/02-folder.png
EOF
```

Screenshots land wherever you tell `ss` to put them (paths are created if
missing) — `out/` above is just a convention, not required.

Commands:

| command | what it does |
|---|---|
| `launch [exePath]` | Launch the app (default: `release/win-unpacked/cairn.exe`) |
| `wait <ms>` | Sleep |
| `ss <path>` | Screenshot the window |
| `click <selector>` | Click an element (Playwright selector, e.g. `text=Work`) |
| `fill <selector> <text>` | Set a plain `<input>`/`<textarea>`'s value — **not** the note editor, see Gotchas |
| `type <text>` | Type raw keystrokes into whatever has focus |
| `key <keyName>` | Press a named key, e.g. `Control+End`, `Enter`, `Escape` |
| `text <selector>` | Print an element's `innerText` |
| `eval <jsExpression>` | `page.evaluate(expression)` in the renderer, prints the JSON result |
| `sh <command>` | Run a shell command mid-scenario (e.g. `cairn-cli.exe` to simulate an external write while the app is open) |
| `autodialog accept\|dismiss` | Auto-respond to `window.confirm`/`alert` dialogs from here on (they otherwise block forever — see Gotchas) |
| `quit` | Close the app early (otherwise happens automatically at the end) |

## Run (human path)

`release\win-unpacked\cairn.exe` directly, or `npm run dev` for hot-reload
development. Neither is useful for an agent to drive — `npm run dev`'s vite
dev server + Electron combo isn't a stable target for the driver above.

## Test

```bash
npm run typecheck
npm test
```

## Gotchas

- **`window.confirm`/`window.alert` block forever without `autodialog`.**
  A few actions (e.g. "Clean up unused attachments") use plain
  `window.confirm`/`alert`, which show a native dialog Playwright doesn't
  auto-dismiss by default in an Electron `_electron` session — run
  `autodialog accept` (or `dismiss`) *before* the step that triggers one.
- **The note editor is CodeMirror, not a plain `<input>`.** `fill` won't
  work on it. Click into the text with `click text=...` (matches on
  visible text), then `key Control+End` to jump to the end of the
  document, then `type <text>` to insert at the cursor.
- **Racing the 500ms autosave debounce to test the conflict banner.**
  `EditorPane.tsx` debounces autosave 500ms after a keystroke. To make an
  external write (via `sh ... cairn-cli.exe update_note ...`) land as a
  genuine conflict (banner shown) rather than a silent adopt (no local
  edits pending, so the new content is just picked up), the `sh` step
  must immediately follow `type` with **no** `wait` in between — otherwise
  the GUI's own autosave usually wins the race and there's nothing left
  to conflict with by the time the external write happens.
- **CLI/MCP access is deny-by-default per notes folder** (see
  `docs/reference.md`'s Access control section). `cairn-cli.exe` commands
  in a `sh` step will fail with "has not been granted" unless the target
  folder is already in `<userData>/cli-access.json`'s `allowed` list —
  either grant it through the running app first, or write that file
  directly for a scripted scenario.
- **The app restores previous tab/window state on launch** (workspace
  state persisted per notes folder). A freshly-launched instance may
  already have tabs open from the last real session — don't assume a
  blank slate; `ss` after `click`ing into the target folder to see what's
  actually open before scripting further.
- **Real user data.** The driver launches the real packaged app against
  the real `notesFolders.json`/`cli-access.json` in `%APPDATA%\cairn`, not
  a sandboxed profile. Clean up anything you write into a real notes
  folder or the registry after a scenario (see this skill's own commit
  history for the pattern used to grant/revoke `cli-access.json` and
  restore a note's content around a test).

## Troubleshooting

- **`Error: browserType.launch: Executable doesn't exist at ...cairn.exe`**:
  run `npm run build:unpack` first — the driver doesn't build for you.
