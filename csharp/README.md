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
  src/Cairn.Mobile  .NET MAUI app (Android so far) hosting the same renderer in a HybridWebView. See "Mobile".
  src/Cairn.Cli     cairn-cli: the command line and the MCP server in one executable. See "Command line and MCP server".
  tests/            xUnit. Golden fixtures are produced by running the original TypeScript.
  scripts/          Generators for tables copied from shared/ (code languages, theme palettes, starter notes).
```

## Build and run

Requires the .NET 8 SDK (or newer) and Node (only to build the renderer).

```bash
npx vite build                    # from the repo root: writes dist/ (the renderer)
cd csharp
dotnet run --project src/Cairn.Host
dotnet test                       # 277 tests (1 is skipped: it needs a real keyring)
```

`dotnet build` runs `npx vite build` itself when `dist/index.html` is missing. The app shares Electron's user
data folder (`%APPDATA%/cairn`, `~/Library/Application Support/cairn`, `~/.config/cairn`), so settings, registered
folders and history carry over; set `CAIRN_USER_DATA_DIR` to use a separate one.

Publish for another platform with e.g. `dotnet publish src/Cairn.Host -c Release -r linux-x64 --self-contained`
(`win-x64`, `osx-arm64`, ...). Linux needs `libwebkit2gtk-4.1`; Windows needs the WebView2 runtime.

Debugging: `CAIRN_DEVTOOLS=1` enables the inspector, `CAIRN_LOG=1` writes `<userData>/logs/host.log`, and
`CAIRN_REMOTE_DEBUG_PORT=9333` exposes the Chrome DevTools protocol (Windows/Chromium) for automation.

## Where notes folders live

*File → New Notes Folder…* asks only for a name; the app places the folder under `CairnPaths.NotesRoot`
(`~/Documents/Cairn` on desktop) and the registry stores just its directory name (`dir`), deriving `root` on read,
so the registry isn't tied to one machine's paths. *Link Existing Folder…* keeps the older behavior (an explicit
absolute path) for folders that must live elsewhere, such as Claude's memory directory; hosts that can't show a
folder picker hide it. The CLI's `add_folder` only creates linked folders.

## Mobile (Android)

`src/Cairn.Mobile` is a .NET MAUI app that reuses `Cairn.Core` and the React renderer unchanged. It is Android-only
so far, and deliberately not in `Cairn.sln`: it multi-targets, so it has its own `Directory.Build.props` to shadow
the repo-wide `net8.0` one.

Requires the .NET 10 SDK with the `maui-android` workload (`dotnet workload install maui-android`), a JDK, the
Android SDK platform 36.1 (the project targets `net10.0-android36.1`) and an emulator or device.

```bash
npx vite build                    # from the repo root: the renderer is packaged into the APK as assets
cd csharp/src/Cairn.Mobile
dotnet build -f net10.0-android36.1 -t:Run                # Debug, deployed to the running emulator/device
dotnet build -f net10.0-android36.1 -c Release -t:Run     # trimmed Release
```

The renderer's assets are declared statically, so `dist/` must exist before the build (the vite step above).
Deploying with `-t:Run` can reinstall the app, which wipes its data (expect to recreate your test folder), and
`adb shell run-as` only works on Debug builds.

How it differs from the desktop host:

- **Transport:** `HybridWebView` raw messages carry the same `{id, channel, args}` wire format. `MainPage` rewrites
  `index.html` in `WebResourceRequested` to inject the desktop `bridge.js` plus a shim mapping `window.external`
  onto `HybridWebView`.
- **Custom schemes:** `cairn-attachment://` and `cairn-plugin://` are answered from the same hook, using
  `Cairn.Core.App.CustomSchemes` (shared with the Photino host).
- **Storage:** user data and managed notes folders live in the app sandbox (`userdata/`, `notes/` under
  `FileSystem.AppDataDirectory`). There is no folder picker, so the page sets `window.__cairnHost.canPickFolder = false`.
- **Layout:** below 768px the renderer switches to a compact layout (the sidebar and right panel become overlay
  drawers, a ☰ button opens the sidebar, controls are sized for touch). This is renderer CSS and applies to any
  narrow window, not only the app.
- **Plugins:** `plugins/` is packaged as assets and extracted to `bundled-plugins/` at startup; the usual
  `BundledPlugins.Seed` installs from there (disabled until the user enables a plugin).

Checked on a Pixel 7 emulator (API 35): the renderer loads, notes folders create and open, notes edit and
preview, attachments render, the daily note works (templates, YAML), plugin iframes load, a 2 MiB binary and
YAML dates round-trip through the bridge, and the trimmed Release build behaves the same as Debug.

Not done: iOS (the asset extraction in `BundledAssets` is Android-only, and nothing has been built for it), export,
PDF and voice (as on desktop, `MobilePlatform` throws), landscape and tablet layouts, and signing/store packaging.
GitHub sync is wired up on Android (see below) but has only been taken as far as the "Connect GitHub" screen there.

## GitHub sync

The `github-sync` plugin's host half (`plugin:invoke`) lives in `Cairn.Core/Sync` and is shared by the desktop and
Android hosts. Electron uses isomorphic-git with a real `.git` folder; the C# build has no git implementation that
runs on Android (LibGit2Sharp ships no Android binaries, and there is no `git` to shell out to), so it talks to
GitHub's REST API instead:

- `GithubClient` wraps the user, repository and Git Data endpoints; `GithubAuth` is the OAuth device flow.
- `SyncLocal` hashes files exactly as git does (checked against `git hash-object` in the tests) and keeps a
  per-folder snapshot of what last matched GitHub in `<folder>/.cairn/sync-state.json`.
- `GitSyncEngine` does a three-way comparison of snapshot, folder and GitHub. A pull applies only the files GitHub
  changed and refuses (changing nothing) if the same file changed on both sides; a push is one commit on top of
  GitHub's head, fast-forward only. Like the Electron version, it never overwrites either side.
- `GitSyncCapability` has the same method names, results and enabled-plus-`git-sync`-permission gate as
  `electron/gitSyncCapability.ts`, so the plugin runs unchanged and never sees the token.

Differences from Electron: no `.git` folder is created or read, so history exists only on GitHub, and a folder
synced from both apps keeps two independent snapshots (both still sync against the same repository). Only regular
files are synced (no symlinks, submodules or executable bits), `.gitignore` support is a small subset (`*`, `?`,
`dir/`, anchored paths; no `!` or `**`), and a repository too large for GitHub's recursive tree API is refused. An
empty repository is handled through the Contents API, since the Git Data API rejects it.

The token is kept by an `ISecretStore`, one per platform, and is never written in plaintext (if no store is
available, sign-in is refused with the reason):

- **Windows:** DPAPI files under `<userData>/secrets`, separate from Electron's, so sign in once in each app.
- **Android:** the keystore-backed `SecureStorage`; the "Allow GitHub sync" prompt is a native dialog.
- **Linux:** the Secret Service (GNOME Keyring, KWallet) through `secret-tool`, which needs the `libsecret-tools`
  package and a desktop session bus. The secret is sent over stdin, never on a command line. Checked against a real
  GNOME Keyring (Ubuntu 22.04); `secret-tool`'s exit codes are undocumented, so they were measured, not assumed.
- **macOS:** the login Keychain through `/usr/bin/security -i`, secret over stdin as base64 and read back after every
  write (the tool can exit 0 having stored nothing). **Not yet run on a Mac.** One known limit: an item created with the
  `security` tool can be read back by any process running as the same user without a Keychain prompt, which a native
  Keychain API with an app-specific access list would not allow.

To run the real-keyring test on a machine that has one: `CAIRN_TEST_REAL_KEYRING=1 dotnet test --filter RealKeyring`.

Verification so far is against `FakeGithub`, an in-memory implementation of the endpoints used (see the tests); it
encodes my reading of GitHub's documented behavior, so a run against github.com is still the real check.

## Command line and MCP server

`src/Cairn.Cli` builds `cairn-cli`, the port of `electron/cli.ts`, `cliMain.ts` and `mcpServer.ts`. Electron ships these
as two things (a Node single-executable CLI and a separate `node` MCP script); here it is one executable with an `mcp`
mode:

```bash
dotnet run --project src/Cairn.Cli -- list_folders
dotnet run --project src/Cairn.Cli -- add_note --folder Work "Idea" --content "some text"
dotnet run --project src/Cairn.Cli -- mcp          # MCP server over stdio
dotnet publish src/Cairn.Cli -c Release -r win-x64 --self-contained -p:PublishSingleFile=true   # one ~65 MB file, no .NET needed
```

The commands, flags, usage messages, JSON output (including key order) and exit codes are the same as the Electron CLI's,
so the command list and examples in the main README apply unchanged. It reads and writes the same `notesFolders.json`,
`cli-access.json` and `history/` as the GUI, so a folder must have been granted "Allow CLI/MCP access" in the app first
(`CAIRN_USER_DATA_DIR` points it at another data folder). Registering a folder with `add_folder` grants it access, as in
Electron, and only creates linked folders; managed folders are made from the app.

For an MCP client, the server entry is the executable with the argument `mcp`, e.g. in Claude Desktop's config:

```json
{ "mcpServers": { "cairn": { "command": "C:\\path\\to\\cairn-cli.exe", "args": ["mcp"] } } }
```

The 17 tools, their descriptions and input schemas are the TypeScript server's (the tests compare them with its own
`tools/list`). Only the tools capability is implemented, which is all the TypeScript server declares. The logic lives in
`Cairn.Core/Cli` (`CliOperations`, `CliCommands`, `McpServer`), so another host could call it too.

Differences: `mtimeMs` has 100 ns resolution (see below); `get_tags` sorts with the .NET invariant culture rather than
ICU's `localeCompare` (the same on every case in the tests, but not guaranteed identical for every script); and the
tools' argument errors are worded after the SDK's zod messages rather than being byte-identical. The server was also
checked end to end with the official TypeScript MCP SDK's client.

## Keeping the port honest

`tests/fixtures/generate.ts` runs the original TypeScript (gray-matter, js-yaml, mustache, `shared/*`) over a set
of inputs and writes `golden.json`; the C# tests assert identical output. After changing the TypeScript behavior:

```bash
npx vite-node -c vitest.config.ts csharp/tests/fixtures/generate.ts
npx vite-node -c vitest.config.ts csharp/scripts/generate-shared-data.ts
npx vite build                                                            # builds dist-electron/mcpServer.js
npx vite-node -c vitest.config.ts csharp/tests/fixtures/generate-cli.ts   # cli-scenario.json and mcp-tools.json
```

`ContractTests` also fails if `electron/preload.ts` gains an IPC channel the C# router or `bridge.js` lacks.

## Not ported yet

| Area | State |
| --- | --- |
| Token storage on macOS | Implemented through the `security` tool but never run on a Mac; see "GitHub sync". |
| PDF export (`export:savePdf`) | Returns an error; HTML/Markdown export work. |
| Voice-note transcription | Returns an error. |
| Window chrome | Drawn by the page on Windows/Linux (drag, resize grips, min/max/close, look-alike system menu). macOS keeps its native frame and traffic lights. Set `CAIRN_NATIVE_CHROME=1` to force the OS frame. Resize/drag are untested on Linux. |
| Plugin network gating | CSP is applied via `<meta>`; Electron's per-request `webRequest` check is not. |
| Packaging/installers | Only `dotnet publish` (desktop) and a debug/Release APK (Android); no installers or store packaging. |
| iOS | Not built; `BundledAssets` extraction is Android-only. |

Known small differences: `mtimeMs` has 100 ns rather than 1 ns resolution; `fs.watch` events come from
`FileSystemWatcher` (coalesced to match chokidar's behavior, but not byte-identical on every platform).
