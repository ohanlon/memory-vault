# Cairn — C# port (work in progress)

A port of the Electron app to .NET, living beside the original so both can be run and compared. It reuses the
React/CodeMirror renderer unchanged; everything that was Electron's main process (`electron/`) and the shared
logic (`shared/`) is rewritten in C#.

```
csharp/
  src/Cairn.Core    Parsing, graph, YAML/frontmatter, settings, notes-folder I/O, watcher, search, templates,
                    plugins registry, and IpcRouter (every window.memoryStack channel). No UI dependencies.
  src/Cairn.Host    Native window (PhotinoX: WebView2 / WKWebView / WebKitGTK) that serves the renderer from
                    app://, injects the window.memoryStack bridge, and implements dialogs/shell.
  tests/            xUnit. Golden fixtures are produced by running the original TypeScript.
  scripts/          Generators for tables copied from shared/ (code languages, theme palettes, starter notes).
```

## Build and run

Requires the .NET 8 SDK (or newer) and Node (only to build the renderer).

```bash
npx vite build                    # from the repo root: writes dist/ (the renderer)
cd csharp
dotnet run --project src/Cairn.Host
dotnet test                       # 146 tests
```

`dotnet build` runs `npx vite build` itself when `dist/index.html` is missing. The app shares Electron's user
data folder (`%APPDATA%/cairn`, `~/Library/Application Support/cairn`, `~/.config/cairn`), so settings, registered
folders and history carry over; set `CAIRN_USER_DATA_DIR` to use a separate one.

Publish for another platform with e.g. `dotnet publish src/Cairn.Host -c Release -r linux-x64 --self-contained`
(`win-x64`, `osx-arm64`, ...). Linux needs `libwebkit2gtk-4.1`; Windows needs the WebView2 runtime.

Debugging: `CAIRN_DEVTOOLS=1` enables the inspector, `CAIRN_LOG=1` writes `<userData>/logs/host.log`, and
`CAIRN_REMOTE_DEBUG_PORT=9333` exposes the Chrome DevTools protocol (Windows/Chromium) for automation.

## Keeping the port honest

`tests/fixtures/generate.ts` runs the original TypeScript (gray-matter, js-yaml, mustache, `shared/*`) over a set
of inputs and writes `golden.json`; the C# tests assert identical output. After changing the TypeScript behavior:

```bash
npx vite-node -c vitest.config.ts csharp/tests/fixtures/generate.ts
npx vite-node -c vitest.config.ts csharp/scripts/generate-shared-data.ts
```

`ContractTests` also fails if `electron/preload.ts` gains an IPC channel the C# router or `bridge.js` lacks.

## Not ported yet

| Area | State |
| --- | --- |
| GitHub sync plugin host (`plugin:invoke`: OAuth, git) | Returns an error; the `github-sync` plugin can't connect. |
| CLI (`electron/cli.ts`) and MCP server | Not started. |
| PDF export (`export:savePdf`) | Returns an error; HTML/Markdown export work. |
| Voice-note transcription | Returns an error. |
| Window chrome | Native title bar instead of the custom hidden title bar + overlay buttons; no custom system menu. |
| Plugin network gating | CSP is applied via `<meta>`; Electron's per-request `webRequest` check is not. |
| Packaging/installers | Only `dotnet publish`. |

Known small differences: `mtimeMs` has 100 ns rather than 1 ns resolution; `fs.watch` events come from
`FileSystemWatcher` (coalesced to match chokidar's behavior, but not byte-identical on every platform).
