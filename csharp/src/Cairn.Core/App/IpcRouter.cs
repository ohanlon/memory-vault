using System.Text.Json.Nodes;
using System.Text.RegularExpressions;
using Cairn.Core.Markdown;
using Cairn.Core.Models;
using Cairn.Core.Plugins;
using Cairn.Core.Shared;
using Cairn.Core.Storage;

namespace Cairn.Core.App;

/// <summary>
/// The main process's IPC surface (electron/main.ts) as a transport-independent router: the host forwards each
/// <c>window.memoryStack</c> call here by channel name, with positional JSON arguments, and sends back the returned
/// JSON (or the thrown message). Events the main process used to push to the window go out through
/// <paramref name="emit"/>.
/// </summary>
public sealed class IpcRouter : IDisposable
{
    private readonly CairnPaths _paths;
    private readonly IPlatformServices _platform;
    private readonly Action<string, JsonNode?> _emit;
    private readonly Dictionary<string, Func<JsonArray, Task<JsonNode?>>> _handlers = new(StringComparer.Ordinal);

    private sealed class Session
    {
        public required List<Note> Notes { get; set; }
        public required NotesFolderWatcher Watcher { get; init; }
    }

    private Session? _session;
    // The currently-open notes folder's root, or null when nothing is open.
    private string? _activeRoot;
    private int _searchCounter;
    private readonly HashSet<string> _activeSearchIds = new();
    private readonly HashSet<string> _cancelledSearchIds = new();
    private readonly object _gate = new();

    public IpcRouter(CairnPaths paths, IPlatformServices platform, Action<string, JsonNode?> emit)
    {
        _paths = paths;
        _platform = platform;
        _emit = emit;
        RegisterHandlers();
    }

    /// <summary>The currently open notes folder (the cairn-attachment:// protocol serves files from here).</summary>
    public string? ActiveRoot => _activeRoot;

    public bool Has(string channel) => _handlers.ContainsKey(channel);

    public IEnumerable<string> Channels => _handlers.Keys;

    /// <summary>Runs one call. Throws on failure, exactly where the Electron handler would have thrown.</summary>
    public Task<JsonNode?> InvokeAsync(string channel, JsonArray args)
    {
        if (!_handlers.TryGetValue(channel, out var handler))
            throw new InvalidOperationException($"No handler registered for '{channel}'");
        return handler(args);
    }

    // ---- shared helpers -----------------------------------------------------------------------

    private string RequireActiveRoot() => _activeRoot ?? throw new InvalidOperationException("No notes folder open");

    // Throws unless absPath lives inside the currently-open notes folder.
    private void AssertOwnsPath(string absPath)
    {
        var root = _activeRoot ?? throw new InvalidOperationException("No notes folder open");
        var rel = Path.GetRelativePath(root, absPath);
        if (rel == "." || rel.StartsWith("..", StringComparison.Ordinal) || Path.IsPathRooted(rel))
            throw new InvalidOperationException("The open notes folder does not contain this path");
    }

    private IEnumerable<Note> SessionNotes => _session?.Notes ?? new List<Note>();

    private static string Str(JsonArray args, int i) =>
        Js.IsString(i < args.Count ? args[i] : null, out var s) ? s : throw new ArgumentException($"Argument {i} must be a string");

    private static string? OptStr(JsonArray args, int i) =>
        Js.IsString(i < args.Count ? args[i] : null, out var s) ? s : null;

    private static bool Bool(JsonArray args, int i) =>
        Js.IsBool(i < args.Count ? args[i] : null, out var b) && b;

    private static JsonNode? Arg(JsonArray args, int i) => i < args.Count ? args[i] : null;

    private static JsonNode? Json<T>(T value) => CairnJson.ToNode(value);

    private static JsonNode? Val(string s) => JsonValue.Create(s);

    private static byte[] BinaryArg(JsonArray args, int i)
    {
        if (Arg(args, i) is JsonObject o && Js.IsString(o["__bin"], out var b64)) return Convert.FromBase64String(b64);
        throw new ArgumentException($"Argument {i} must be binary data");
    }

    private void On(string channel, Func<JsonArray, Task<JsonNode?>> handler) => _handlers[channel] = handler;

    private void OnSync(string channel, Func<JsonArray, JsonNode?> handler) =>
        _handlers[channel] = args =>
        {
            try
            {
                return Task.FromResult(handler(args));
            }
            catch (Exception e)
            {
                return Task.FromException<JsonNode?>(e);
            }
        };

    private JsonObject ReadSettings() => PreferenceFiles.ReadAppSettings(_paths.AppSettings);

    private static string RelativeTo(string root, string absPath) => Path.GetRelativePath(root, absPath);

    private JsonObject NotesIndex(string root) => new()
    {
        ["root"] = root,
        ["notes"] = CairnJson.ToNode(SessionNotes.ToList()),
    };

    // ---- sessions -----------------------------------------------------------------------------

    private void StopSession()
    {
        _session?.Watcher.Dispose();
        _session = null;
        _activeRoot = null;
    }

    private void CancelAllSearches()
    {
        lock (_gate) foreach (var id in _activeSearchIds) _cancelledSearchIds.Add(id);
    }

    // Loads (or serves from cache) a notes folder's notes and starts watching it. A cached vault loads instantly;
    // only a vault that's never been opened pays for a full walk, which then seeds the cache.
    private async Task OpenSessionAsync(string root)
    {
        var cached = NotesFolderCache.Read(root);
        var notes = cached ?? await Task.Run(() => NotesFolderFs.LoadNotesFolder(root));
        if (cached is null) NotesFolderCache.Write(root, notes);

        var watcher = new NotesFolderWatcher(root, change => _emit("notesFolder:file-changed", Json(change)));
        var session = new Session { Notes = notes, Watcher = watcher };
        _session = session;

        // Reconcile the cache against disk in the background and push the result only if something differs.
        // The renderer treats reconciliation as started the moment notesFolder:load resolves, so only the
        // "done" transition is pushed here.
        _ = Task.Run(() =>
        {
            try
            {
                var reconciled = NotesFolderFs.ReconcileCache(root, session.Notes);
                if (reconciled is null || _session != session) return;
                session.Notes = reconciled;
                _emit("notesFolder:reconciled", new JsonObject { ["root"] = root, ["notes"] = CairnJson.ToNode(reconciled) });
            }
            catch (Exception)
            {
                // a failed background pass just leaves the cached index in place
            }
            finally
            {
                if (_session == session)
                    _emit("notesFolder:reconcile-status", new JsonObject { ["root"] = root, ["reconciling"] = false });
            }
        });
    }

    private List<Note> ReloadSession()
    {
        var root = RequireActiveRoot();
        var session = _session ?? throw new InvalidOperationException("No notes folder open");
        var previous = session.Notes.GroupBy(n => n.RelativePath).ToDictionary(g => g.Key, g => g.Last());
        var notes = NotesFolderFs.LoadNotesFolder(root, previous);
        session.Notes = notes;
        NotesFolderCache.Write(root, notes);
        return notes;
    }

    /// <summary>Only enabled plugins are ever live: what the renderer registers and what the plugin protocol serves.</summary>
    public List<DiscoveredPlugin> EnabledPlugins()
    {
        var state = PluginState.Read(_paths.PluginState);
        return PluginRegistry.Discover(_paths.Plugins).Where(p => PluginState.IsEnabled(state, p.Id)).ToList();
    }

    public JsonObject ReadPluginPermissions() => PluginPermissions.Read(_paths.PluginPermissions);

    /// <summary>Startup work from electron/main.ts: storage migration and bundled-plugin seeding.</summary>
    public void Initialize()
    {
        MigrateNotesFolderStorage();
        PluginState.Write(_paths.PluginState,
            BundledPlugins.Seed(_platform.BundledPluginsDir, _paths.Plugins, PluginState.Read(_paths.PluginState)));
    }

    // One-time migration from the pre-rename storage layout: stacks.json -> notesFolders.json, and each folder's
    // <root>/.stack/properties.yaml -> <root>/.cairn/properties.yaml.
    private void MigrateNotesFolderStorage()
    {
        var oldFile = Path.Combine(_paths.UserData, "stacks.json");
        var newFile = _paths.NotesFolders;
        if (File.Exists(oldFile) && !File.Exists(newFile)) File.Move(oldFile, newFile);

        foreach (var folder in NotesFolderRegistry.Read(newFile))
        {
            var root = NotesFolderRegistry.RootOf(folder);
            var oldDir = Path.Combine(root, ".stack");
            var newDir = Path.Combine(root, ".cairn");
            if (!Directory.Exists(oldDir)) continue;
            var oldProps = Path.Combine(oldDir, "properties.yaml");
            if (!File.Exists(oldProps)) continue;
            Directory.CreateDirectory(newDir);
            var newProps = Path.Combine(newDir, "properties.yaml");
            if (!File.Exists(newProps)) File.Move(oldProps, newProps);
        }
    }

    // ---- handlers -----------------------------------------------------------------------------

    private void RegisterHandlers()
    {
        // --- shell / dialogs
        On("shell:openExternal", async args =>
        {
            var url = Str(args, 0);
            // Only the host app itself calls this channel; plugin-originated opens go through plugin:openExternal.
            if (!DomainPolicy.IsAllowedExternalUrl(url, null, new JsonObject())) return JsonValue.Create(false);
            await _platform.OpenExternalAsync(url);
            return JsonValue.Create(true);
        });

        On("plugin:openExternal", async args =>
        {
            var permissions = PluginPermissions.Read(_paths.PluginPermissions);
            var url = Str(args, 1);
            if (!DomainPolicy.IsAllowedExternalUrl(url, Str(args, 0), permissions)) return JsonValue.Create(false);
            await _platform.OpenExternalAsync(url);
            return JsonValue.Create(true);
        });

        OnSync("shell:showItemInFolder", args =>
        {
            var absPath = Str(args, 0);
            AssertOwnsPath(absPath);
            _platform.ShowItemInFolder(absPath);
            return JsonValue.Create(true);
        });

        On("notesFolder:pick", async _ => (await _platform.PickFolderAsync()) is { } picked ? Val(picked) : null);

        // --- notes folder registry
        OnSync("notesFolders:list", _ => ToArray(NotesFolderRegistry.Read(_paths.NotesFolders)));

        OnSync("notesFolders:add", args =>
        {
            var updated = NotesFolderRegistry.Add(NotesFolderRegistry.Read(_paths.NotesFolders), Str(args, 0), Str(args, 1));
            NotesFolderRegistry.Write(_paths.NotesFolders, updated);
            return ToArray(updated);
        });

        OnSync("notesFolders:remove", args =>
        {
            var name = Str(args, 0);
            var updated = NotesFolderRegistry.Remove(NotesFolderRegistry.Read(_paths.NotesFolders), name);
            NotesFolderRegistry.Write(_paths.NotesFolders, updated);
            // Otherwise a later folder re-registered under the same name would silently inherit its access/link.
            CliAccess.Write(_paths.CliAccess, CliAccess.Deny(CliAccess.Read(_paths.CliAccess), name));
            SyncConfig.Write(_paths.SyncConfig, SyncConfig.Remove(SyncConfig.Read(_paths.SyncConfig), name));
            return ToArray(updated);
        });

        OnSync("notesFolders:rename", args =>
        {
            var oldName = Str(args, 0);
            var newName = Str(args, 1);
            var updated = NotesFolderRegistry.Rename(NotesFolderRegistry.Read(_paths.NotesFolders), oldName, newName);
            NotesFolderRegistry.Write(_paths.NotesFolders, updated);
            CliAccess.Write(_paths.CliAccess, CliAccess.Rename(CliAccess.Read(_paths.CliAccess), oldName, newName));
            SyncConfig.Write(_paths.SyncConfig, SyncConfig.Rename(SyncConfig.Read(_paths.SyncConfig), oldName, newName));
            return ToArray(updated);
        });

        OnSync("cliAccess:list", _ => StringArray(CliAccess.Read(_paths.CliAccess)));

        OnSync("cliAccess:set", args =>
        {
            var access = CliAccess.Read(_paths.CliAccess);
            var updated = Bool(args, 1) ? CliAccess.Allow(access, Str(args, 0)) : CliAccess.Deny(access, Str(args, 0));
            CliAccess.Write(_paths.CliAccess, updated);
            return StringArray(updated);
        });

        // --- sessions
        On("notesFolder:load", async args =>
        {
            var root = Str(args, 0);
            StopSession();
            CancelAllSearches();
            _activeRoot = root;
            await OpenSessionAsync(root);
            return NotesIndex(root);
        });

        OnSync("notesFolder:reload", _ => new JsonObject { ["notes"] = CairnJson.ToNode(ReloadSession()) });

        // --- search
        OnSync("search:start", args =>
        {
            var root = RequireActiveRoot();
            var options = ReadSearchOptions(Arg(args, 0));
            string searchId;
            lock (_gate)
            {
                searchId = $"search-{++_searchCounter}";
                _activeSearchIds.Add(searchId);
            }

            _ = Search.RunSearchAsync(
                root,
                options,
                result => _emit("search:result", new JsonObject { ["searchId"] = searchId, ["result"] = Json(result) }),
                () => { lock (_gate) return _cancelledSearchIds.Contains(searchId); })
                .ContinueWith(_ =>
                {
                    lock (_gate)
                    {
                        _activeSearchIds.Remove(searchId);
                        _cancelledSearchIds.Remove(searchId);
                    }
                    _emit("search:done", new JsonObject { ["searchId"] = searchId });
                }, TaskScheduler.Default);

            return Val(searchId);
        });

        OnSync("search:cancel", args =>
        {
            lock (_gate) _cancelledSearchIds.Add(Str(args, 0));
            return JsonValue.Create(true);
        });

        On("search:replaceAll", async args =>
        {
            var root = RequireActiveRoot();
            return Json(await Search.RunReplaceAllAsync(root, ReadSearchOptions(Arg(args, 0)), Str(args, 1)));
        });

        // --- plugins
        OnSync("plugin:list", _ => ToArray(EnabledPlugins().Select(p => p.Manifest)));

        OnSync("plugin:listAll", _ =>
        {
            var state = PluginState.Read(_paths.PluginState);
            var result = new JsonArray();
            foreach (var p in PluginRegistry.Discover(_paths.Plugins))
                result.Add(new JsonObject { ["manifest"] = p.Manifest.DeepClone(), ["enabled"] = PluginState.IsEnabled(state, p.Id) });
            return result;
        });

        OnSync("plugin:setEnabled", args =>
        {
            var pluginId = Str(args, 0);
            if (!PluginRegistry.Discover(_paths.Plugins).Any(p => p.Id == pluginId))
                throw new InvalidOperationException($"Unknown plugin \"{pluginId}\"");
            PluginState.Write(_paths.PluginState, PluginState.SetEnabled(PluginState.Read(_paths.PluginState), pluginId, Bool(args, 1)));
            return JsonValue.Create(true);
        });

        OnSync("plugin:getPermissions", _ => PluginPermissions.Read(_paths.PluginPermissions));

        On("plugin:requestPermission", async args =>
        {
            var pluginId = Str(args, 0);
            var pluginName = Str(args, 1);
            var permission = Str(args, 2);
            var permissions = PluginPermissions.Read(_paths.PluginPermissions);
            if (PluginPermissions.Has(permissions, pluginId, permission)) return JsonValue.Create(true);

            var granted = await _platform.ConfirmPluginPermissionAsync(pluginName, permission, PermissionDetail(permission));
            if (granted) PluginPermissions.Write(_paths.PluginPermissions, PluginPermissions.Grant(permissions, pluginId, permission));
            return JsonValue.Create(granted);
        });

        OnSync("plugin:revokePermission", args =>
        {
            var permissions = PluginPermissions.Read(_paths.PluginPermissions);
            PluginPermissions.Write(_paths.PluginPermissions, PluginPermissions.Revoke(permissions, Str(args, 0), Str(args, 1)));
            return JsonValue.Create(true);
        });

        OnSync("plugin:notes:read", args => Val(NoteProperties.ReadBody(ResolveWithinActiveRoot(Str(args, 0)))));

        OnSync("plugin:notes:write", args =>
        {
            NoteProperties.SaveBody(ResolveWithinActiveRoot(Str(args, 0)), Str(args, 1));
            return JsonValue.Create(true);
        });

        On("plugin:invoke", _ => throw new NotSupportedException(
            "Plugin host capabilities (such as GitHub sync) are not available in the C# build yet."));

        // --- notes
        On("notesFolder:readNote", async args =>
        {
            var root = RequireActiveRoot();
            return Json(await Task.Run(() => NotesFolderFs.ReadNote(root, Str(args, 0))));
        });

        OnSync("notesFolder:readRaw", args =>
        {
            AssertOwnsPath(Str(args, 0));
            return Val(Files.ReadText(Str(args, 0)));
        });

        // Returns the note's new mtime so the renderer can tell its own save apart from a later external write.
        OnSync("notesFolder:saveNote", args =>
        {
            var absPath = Str(args, 0);
            AssertOwnsPath(absPath);
            var root = RequireActiveRoot();
            if (File.Exists(absPath))
                NoteHistory.Record(_paths.History, root, RelativeTo(root, absPath), Files.ReadText(absPath));
            NoteProperties.SaveBody(absPath, Str(args, 1));
            return JsonValue.Create(Files.MtimeMs(absPath));
        });

        OnSync("notesFolder:readNoteBody", args =>
        {
            AssertOwnsPath(Str(args, 0));
            return Val(NoteProperties.ReadBody(Str(args, 0)));
        });

        OnSync("notesFolder:readNoteProperties", args =>
        {
            AssertOwnsPath(Str(args, 0));
            return NoteProperties.ReadProperties(Str(args, 0));
        });

        OnSync("notesFolder:saveNoteProperties", args =>
        {
            AssertOwnsPath(Str(args, 0));
            NoteProperties.SaveProperties(Str(args, 0), Arg(args, 1) as JsonObject ?? new JsonObject());
            return JsonValue.Create(true);
        });

        OnSync("notesFolder:readPropertySchema", args => PropertiesSchema.Read(Str(args, 0)));

        OnSync("notesFolder:savePropertySchema", args =>
        {
            var properties = Arg(args, 1) as JsonArray ?? new JsonArray();
            PropertiesSchema.Write(Str(args, 0), properties);
            return properties.DeepClone();
        });

        OnSync("notesFolder:readWorkspaceState", _ =>
            _activeRoot is null ? WorkspaceStateNormalizer.Defaults() : PreferenceFiles.ReadWorkspaceState(_activeRoot));

        OnSync("notesFolder:saveWorkspaceState", args =>
        {
            PreferenceFiles.WriteWorkspaceState(RequireActiveRoot(), Arg(args, 0));
            return JsonValue.Create(true);
        });

        OnSync("layout:read", _ => PreferenceFiles.ReadLayoutPrefs(_paths.LayoutPrefs));

        OnSync("layout:save", args =>
        {
            PreferenceFiles.WriteLayoutPrefs(_paths.LayoutPrefs, Arg(args, 0));
            return JsonValue.Create(true);
        });

        OnSync("settings:read", _ => ReadSettings());

        OnSync("settings:save", args =>
        {
            PreferenceFiles.WriteAppSettings(_paths.AppSettings, Arg(args, 0));
            return JsonValue.Create(true);
        });

        OnSync("window:setTitleBarOverlay", args =>
        {
            if (Arg(args, 0) is JsonObject colors && Js.IsString(colors["color"], out var color) && Js.IsString(colors["symbolColor"], out var symbol))
                _platform.SetTitleBarOverlay(color, symbol);
            return JsonValue.Create(true);
        });

        // Not part of the Electron API: the C# host draws its own window controls and routes them here.
        On("host:window", async args => JsonValue.Create(await _platform.WindowActionAsync(Str(args, 0))));

        On("window:showSystemMenu", async args =>
        {
            Js.IsNumber(Arg(args, 0), out var x);
            Js.IsNumber(Arg(args, 1), out var y);
            await _platform.ShowSystemMenuAsync(x, y);
            return JsonValue.Create(true);
        });

        OnSync("notesFolder:openOrCreateDailyNote", args =>
        {
            var dateFormat = (string)ReadSettings()["dateFormat"]!;
            return Json(DailyNotes.OpenOrCreate(Str(args, 0), dateFormat, DateTime.Now));
        });

        OnSync("tasks:create", args =>
        {
            var deadline = OptStr(args, 1);
            return Val(Tasks.CreateNote(RequireActiveRoot(), Str(args, 0), deadline, Str(args, 2)));
        });

        OnSync("notesFolder:createNote", args =>
        {
            RequireActiveRoot();
            var title = Str(args, 1).Trim();
            var safeTitle = title.Length > 0 ? title : "New File";
            var fullPath = NotesFolderFs.UniqueNotePath(Str(args, 0), safeTitle);
            var addHeading = (bool)ReadSettings()["addHeadingToNewNotes"]!;
            Files.WriteText(fullPath, NoteTemplates.Find(OptStr(args, 2)).Build(safeTitle, addHeading));
            return Val(fullPath);
        });

        OnSync("notesFolder:createFolder", args =>
        {
            RequireActiveRoot();
            var name = Str(args, 1).Trim();
            var fullPath = NotesFolderFs.UniqueFolderPath(Str(args, 0), name.Length > 0 ? name : "New Folder");
            Directory.CreateDirectory(fullPath);
            return Val(fullPath);
        });

        OnSync("notesFolder:renameFolder", args =>
        {
            var absPath = Str(args, 0);
            AssertOwnsPath(absPath);
            var safeName = Str(args, 1).Trim();
            if (safeName.Length == 0) return Val(absPath);
            var newPath = NotesFolderFs.UniqueFolderPath(Path.GetDirectoryName(absPath)!, safeName);
            Directory.Move(absPath, newPath);
            return Val(newPath);
        });

        // Moves a note into destDir, keeping its filename (uniquified) - drag-and-drop into a folder.
        OnSync("notesFolder:moveNote", args =>
        {
            var absPath = Str(args, 0);
            var destDir = Str(args, 1);
            AssertOwnsPath(absPath);
            AssertOwnsPath(destDir);
            var newPath = NotesFolderFs.UniqueNotePath(destDir, NoteLinks.TitleFromPath(absPath));
            File.Move(absPath, newPath);
            return Val(newPath);
        });

        // --- templates
        OnSync("templates:list", _ => Json(Templates.ListAll(NotesFolderRegistry.Read(_paths.NotesFolders))));

        OnSync("templates:convert", args => Val(Templates.ConvertToTemplate(Str(args, 0), Str(args, 1))));

        OnSync("templates:createNote", args =>
        {
            RequireActiveRoot();
            var title = Str(args, 1).Trim();
            var safeTitle = title.Length > 0 ? title : "New File";
            var fullPath = NotesFolderFs.UniqueNotePath(Str(args, 0), safeTitle);
            var raw = Files.ReadText(Str(args, 2));
            var settings = ReadSettings();
            var expanded = TemplateRender.ExpandBuiltInDateVars(raw, DateTime.Now, new TemplateRender.DateVarDefaults(
                (string)settings["dateFormat"]!, (string)settings["timeFormat"]!, (string)settings["datetimeFormat"]!));

            var values = new Dictionary<string, string>();
            if (Arg(args, 3) is JsonObject given)
                foreach (var (k, v) in given)
                    if (Js.IsString(v, out var s)) values[k] = s;
            values["title"] = safeTitle;
            Files.WriteText(fullPath, TemplateRender.Render(expanded, values));
            return Val(fullPath);
        });

        // Seeds the open (empty) notes folder with example notes; skips anything that would collide.
        OnSync("notesFolder:seedStarterContent", _ =>
        {
            var root = RequireActiveRoot();
            var created = new List<string>();
            foreach (var (fileName, content) in SharedData.StarterNotes)
            {
                var fullPath = Path.Combine(root, fileName);
                if (File.Exists(fullPath) || Directory.Exists(fullPath)) continue;
                Files.WriteText(fullPath, content);
                created.Add(fullPath);
            }
            return StringArray(created);
        });

        // --- attachments
        OnSync("attachments:save", args => Val(Attachments.Save(RequireActiveRoot(), Str(args, 0), BinaryArg(args, 1))));

        // These two work on any registered root, not necessarily the open one (their menu is on the folder picker screen).
        OnSync("attachments:findOrphaned", args =>
        {
            var root = Str(args, 0);
            return StringArray(Attachments.FindOrphaned(root, NotesFolderFs.LoadNotesFolder(root)));
        });

        OnSync("attachments:deleteOrphaned", args =>
        {
            Attachments.Delete(Str(args, 0), StringList(Arg(args, 1)));
            return JsonValue.Create(true);
        });

        OnSync("attachments:readManyAsDataUrls", args =>
        {
            var result = new JsonObject();
            foreach (var (k, v) in Attachments.ReadManyAsDataUrls(Str(args, 0), StringList(Arg(args, 1)))) result[k] = v;
            return result;
        });

        // --- export / voice
        On("export:saveTextFile", async args =>
        {
            var filters = new List<SaveDialogFilter>();
            if (Arg(args, 2) is JsonArray arr)
                foreach (var f in arr.OfType<JsonObject>())
                    filters.Add(new SaveDialogFilter(Js.IsString(f["name"], out var n) ? n : "", StringList(f["extensions"]).ToArray()));
            return JsonValue.Create(await _platform.SaveTextFileAsync(Str(args, 0), Str(args, 1), filters));
        });

        On("export:savePdf", async args => JsonValue.Create(await _platform.SavePdfFromHtmlAsync(Str(args, 0), Str(args, 1))));

        On("voice:transcribe", _ => throw new NotSupportedException("Voice transcription is not available in the C# build yet."));

        // --- history
        OnSync("notesFolder:getNoteHistory", args =>
        {
            var absPath = Str(args, 0);
            AssertOwnsPath(absPath);
            var root = RequireActiveRoot();
            var result = new JsonArray();
            foreach (var ts in NoteHistory.List(_paths.History, root, RelativeTo(root, absPath)))
                result.Add(new JsonObject { ["timestamp"] = ts });
            return result;
        });

        OnSync("notesFolder:readNoteHistoryVersion", args =>
        {
            var absPath = Str(args, 0);
            AssertOwnsPath(absPath);
            var root = RequireActiveRoot();
            return NoteHistory.Read(_paths.History, root, RelativeTo(root, absPath), Str(args, 1)) is { } text ? Val(text) : null;
        });

        // Overwrites the note with a past snapshot, snapshotting its current content first (bypassing the throttle)
        // so a restore is always undoable with another restore.
        OnSync("notesFolder:restoreNoteVersion", args =>
        {
            var absPath = Str(args, 0);
            var timestamp = Str(args, 1);
            AssertOwnsPath(absPath);
            var root = RequireActiveRoot();
            var relPath = RelativeTo(root, absPath);
            var version = NoteHistory.Read(_paths.History, root, relPath, timestamp)
                ?? throw new InvalidOperationException($"No history snapshot found at timestamp \"{timestamp}\".");
            if (File.Exists(absPath))
                NoteHistory.Record(_paths.History, root, relPath, Files.ReadText(absPath), new NoteHistory.Options(Force: true));
            Files.WriteText(absPath, version);
            return JsonValue.Create(Files.MtimeMs(absPath));
        });

        OnSync("notesFolder:deleteNote", args =>
        {
            var absPath = Str(args, 0);
            AssertOwnsPath(absPath);
            var root = RequireActiveRoot();
            if (File.Exists(absPath))
                NoteHistory.Record(_paths.History, root, RelativeTo(root, absPath), Files.ReadText(absPath), new NoteHistory.Options(Force: true));
            if (File.Exists(absPath)) File.Delete(absPath);
            return JsonValue.Create(true);
        });

        On("notesFolder:renameNote", async args =>
        {
            var root = RequireActiveRoot();
            var absPath = Str(args, 0);
            AssertOwnsPath(absPath);
            var oldTitle = NoteLinks.TitleFromPath(RelativeTo(root, absPath));
            var title = NotesFolderFs.AssertValidTitle(Str(args, 1));
            var newPath = NotesFolderFs.RenamedNotePath(absPath, title);
            File.Move(absPath, newPath, overwrite: string.Equals(absPath, newPath, StringComparison.OrdinalIgnoreCase));

            if (Bool(args, 2))
            {
                // Rewrite [[oldTitle]] references across the notes folder.
                var linkRe = new Regex(
                    $@"\[\[({Regex.Escape(oldTitle)})((?:#[^\]|]+)?(?:\|[^\]]+)?)\]\]", RegexOptions.CultureInvariant);
                var notes = await Task.Run(() => NotesFolderFs.LoadNotesFolder(root));
                foreach (var note in notes)
                {
                    if (!note.Content.Contains($"[[{oldTitle}", StringComparison.Ordinal)) continue;
                    var raw = await Files.ReadTextAsync(note.Path);
                    var updated = linkRe.Replace(raw, m => $"[[{title}{m.Groups[2].Value}]]");
                    if (updated != raw) await Files.WriteTextAsync(note.Path, updated);
                }
            }
            return Val(newPath);
        });
    }

    private static string PermissionDetail(string permission) => permission switch
    {
        "network" => "Lets the plugin make network requests to any site.",
        "shell:openExternal" => "Lets the plugin open links in your default browser.",
        "git-sync" =>
            "Lets the plugin sign in to GitHub on your behalf, list and create your repositories, read which files changed in your notes folder, and commit and push them. It never sees your GitHub token.",
        _ => "This grants the plugin capability beyond reading and writing notes in this notes folder.",
    };

    // Resolves a plugin RPC's relative path against the open notes folder's root.
    private string ResolveWithinActiveRoot(string relativePath)
    {
        var root = RequireActiveRoot();
        var resolved = Path.GetFullPath(Path.Combine(root, relativePath));
        var rel = Path.GetRelativePath(root, resolved);
        if (rel.StartsWith("..", StringComparison.Ordinal) || Path.IsPathRooted(rel))
            throw new InvalidOperationException("Path escapes the notes folder root");
        return resolved;
    }

    private static SearchOptions ReadSearchOptions(JsonNode? node)
    {
        var o = node as JsonObject ?? throw new ArgumentException("Search options required");
        return new SearchOptions(
            Js.IsString(o["query"], out var q) ? q : "",
            Js.IsString(o["mode"], out var m) ? m : "plain",
            Js.IsBool(o["wholeWord"], out var w) && w,
            Js.IsBool(o["caseSensitive"], out var c) ? c : null);
    }

    private static JsonArray ToArray(IEnumerable<JsonObject> items)
    {
        var arr = new JsonArray();
        foreach (var i in items) arr.Add(i.DeepClone());
        return arr;
    }

    private static JsonArray StringArray(IEnumerable<string> items)
    {
        var arr = new JsonArray();
        foreach (var i in items) arr.Add(i);
        return arr;
    }

    private static List<string> StringList(JsonNode? node) =>
        node is JsonArray arr ? arr.Select(n => Js.IsString(n, out var s) ? s : null).Where(s => s is not null).Select(s => s!).ToList() : new List<string>();

    public void Dispose() => StopSession();
}
