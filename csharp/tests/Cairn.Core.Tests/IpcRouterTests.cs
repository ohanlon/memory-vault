using System.Text.Json.Nodes;
using Cairn.Core.App;
using Cairn.Core.Storage;
using Xunit;

namespace Cairn.Core.Tests;

internal sealed class FakePlatform : IPlatformServices
{
    public string? PickedFolder { get; set; }
    public List<string> OpenedUrls { get; } = new();
    public bool AllowPermission { get; set; }
    public string BundledPluginsDir { get; set; } = Path.Combine(Path.GetTempPath(), "cairn-no-such-plugins");

    public Task<string?> PickFolderAsync() => Task.FromResult(PickedFolder);
    public Task OpenExternalAsync(string url) { OpenedUrls.Add(url); return Task.CompletedTask; }
    public void ShowItemInFolder(string absPath) { }
    public Task<bool> SaveTextFileAsync(string defaultName, string content, IReadOnlyList<SaveDialogFilter> filters) => Task.FromResult(true);
    public Task<bool> SavePdfFromHtmlAsync(string defaultName, string htmlContent) => Task.FromResult(true);
    public Task<bool> ConfirmPluginPermissionAsync(string pluginName, string permission, string detail) => Task.FromResult(AllowPermission);
    public void SetTitleBarOverlay(string color, string symbolColor) { }
    public Task ShowSystemMenuAsync(double x, double y) => Task.CompletedTask;
    public Task<bool> WindowActionAsync(string action) => Task.FromResult(false);
}

public sealed class IpcRouterTests : IDisposable
{
    private readonly string _tmp = Path.Combine(Path.GetTempPath(), "cairn-tests-" + Guid.NewGuid().ToString("N"));
    private readonly string _userData;
    private readonly string _root;
    private readonly FakePlatform _platform = new();
    private readonly List<(string Channel, JsonNode? Payload)> _events = new();
    private readonly IpcRouter _router;

    public IpcRouterTests()
    {
        _userData = Path.Combine(_tmp, "userData");
        _root = Path.Combine(_tmp, "vault");
        Directory.CreateDirectory(_userData);
        Directory.CreateDirectory(_root);
        _router = new IpcRouter(new CairnPaths(_userData, Path.Combine(_tmp, "notes")), _platform, (c, p) => { lock (_events) _events.Add((c, p)); });
    }

    public void Dispose()
    {
        _router.Dispose();
        try { Directory.Delete(_tmp, recursive: true); } catch (IOException) { }
    }

    private async Task<JsonNode?> Call(string channel, params object?[] args)
    {
        var arr = new JsonArray();
        foreach (var a in args)
            arr.Add(a switch { null => null, JsonNode n => n, string s => JsonValue.Create(s), bool b => JsonValue.Create(b), int i => JsonValue.Create(i), _ => throw new ArgumentException() });
        return await _router.InvokeAsync(channel, arr);
    }

    private string Write(string relative, string content)
    {
        var full = Path.Combine(_root, relative);
        Directory.CreateDirectory(Path.GetDirectoryName(full)!);
        File.WriteAllText(full, content);
        return full;
    }

    private async Task<JsonObject> Open()
    {
        var index = (JsonObject)(await Call("notesFolder:load", _root))!;
        return index;
    }

    [Fact]
    public async Task LoadReturnsParsedNotes()
    {
        Write("A.md", "---\ntags: [x]\n---\nSee [[B]] #y\n");
        Write("sub/B.md", "body");
        Write(".hidden/C.md", "ignored");
        var index = await Open();

        Assert.Equal(_root, (string)index["root"]!);
        var notes = index["notes"]!.AsArray();
        Assert.Equal(new[] { "A", "B" }, notes.Select(n => (string)n!["title"]!).OrderBy(x => x));
        var a = notes.First(n => (string)n!["title"]! == "A")!;
        Assert.Equal(new[] { "x", "y" }, a["tags"]!.AsArray().Select(t => (string)t!));
        Assert.True(File.Exists(Path.Combine(_root, ".cairn", "index.json")));
    }

    [Fact]
    public async Task OperationsOutsideTheOpenFolderAreRejected()
    {
        await Open();
        var outside = Path.Combine(_tmp, "outside.md");
        File.WriteAllText(outside, "x");
        var e = await Assert.ThrowsAsync<InvalidOperationException>(() => Call("notesFolder:readRaw", outside));
        Assert.Equal("The open notes folder does not contain this path", e.Message);
    }

    [Fact]
    public async Task NoFolderOpenIsReported()
    {
        var e = await Assert.ThrowsAsync<InvalidOperationException>(() => Call("notesFolder:reload"));
        Assert.Equal("No notes folder open", e.Message);
    }

    [Fact]
    public async Task SaveNotePreservesFrontmatterAndRecordsHistory()
    {
        var path = Write("N.md", "---\ntitle: T\ntags:\n- a\n---\nold\n");
        await Open();

        var mtime = await Call("notesFolder:saveNote", path, "new body\n");
        Assert.True((double)mtime! > 0);
        Assert.Equal("---\ntitle: T\ntags:\n  - a\n---\nnew body\n", File.ReadAllText(path));

        var history = (await Call("notesFolder:getNoteHistory", path))!.AsArray();
        Assert.Single(history);
        var ts = (string)history[0]!["timestamp"]!;
        var snapshot = (string?)await Call("notesFolder:readNoteHistoryVersion", path, ts);
        Assert.Equal("---\ntitle: T\ntags:\n- a\n---\nold\n", snapshot);

        await Call("notesFolder:restoreNoteVersion", path, ts);
        Assert.Equal("---\ntitle: T\ntags:\n- a\n---\nold\n", File.ReadAllText(path));
        Assert.Equal(2, (await Call("notesFolder:getNoteHistory", path))!.AsArray().Count);
    }

    [Fact]
    public async Task SaveNotePropertiesRoundTrips()
    {
        var path = Write("P.md", "body\n");
        await Open();
        await Call("notesFolder:saveNoteProperties", path, new JsonObject { ["status"] = "todo", ["count"] = 3 });
        Assert.Equal("---\nstatus: todo\ncount: 3\n---\nbody\n", File.ReadAllText(path));

        var props = (JsonObject)(await Call("notesFolder:readNoteProperties", path))!;
        Assert.Equal("todo", (string)props["status"]!);
        await Call("notesFolder:saveNoteProperties", path, new JsonObject());
        Assert.Equal("body\n", File.ReadAllText(path));
    }

    [Fact]
    public async Task CreateNoteUsesTemplateAndUniqueNames()
    {
        await Open();
        var first = (string)(await Call("notesFolder:createNote", _root, "Idea"))!;
        var second = (string)(await Call("notesFolder:createNote", _root, "Idea", "meeting"))!;
        Assert.Equal(Path.Combine(_root, "Idea.md"), first);
        Assert.Equal(Path.Combine(_root, "Idea 1.md"), second);
        Assert.Equal("---\ntags: []\n---\n# Idea\n", File.ReadAllText(first));
        Assert.StartsWith("---\ntags: [meeting]\n---\n# Idea\n\n## Attendees", File.ReadAllText(second));
        Assert.EndsWith("New File.md", (string)(await Call("notesFolder:createNote", _root, "   "))!);
    }

    [Fact]
    public async Task RenameNoteUpdatesWikilinksWhenAsked()
    {
        var target = Write("Old Name.md", "x");
        var linker = Write("Linker.md", "a [[Old Name]] b [[Old Name#Sec|alias]] c [[Other]]");
        await Open();

        var newPath = (string)(await Call("notesFolder:renameNote", target, "New Name", true))!;
        Assert.Equal(Path.Combine(_root, "New Name.md"), newPath);
        Assert.False(File.Exists(target));
        Assert.Equal("a [[New Name]] b [[New Name#Sec|alias]] c [[Other]]", File.ReadAllText(linker));

        var e = await Assert.ThrowsAsync<InvalidOperationException>(() => Call("notesFolder:renameNote", newPath, "bad/name", false));
        Assert.Contains("cannot contain", e.Message);
    }

    [Fact]
    public async Task RenameRefusesToOverwriteAnotherNote()
    {
        var a = Write("A.md", "a");
        Write("B.md", "b");
        await Open();
        var e = await Assert.ThrowsAsync<InvalidOperationException>(() => Call("notesFolder:renameNote", a, "B", false));
        Assert.Equal("A note named \"B\" already exists in this folder", e.Message);
    }

    [Fact]
    public async Task MoveAndFolderOperations()
    {
        var note = Write("M.md", "m");
        await Open();
        var folder = (string)(await Call("notesFolder:createFolder", _root, "Dest"))!;
        var moved = (string)(await Call("notesFolder:moveNote", note, folder))!;
        Assert.Equal(Path.Combine(folder, "M.md"), moved);
        var renamed = (string)(await Call("notesFolder:renameFolder", folder, "Dest2"))!;
        Assert.True(Directory.Exists(renamed));
        Assert.False(Directory.Exists(folder));
        Assert.Equal(renamed, (string)(await Call("notesFolder:renameFolder", renamed, "  "))!);
    }

    [Fact]
    public async Task DeleteNoteKeepsASnapshot()
    {
        var path = Write("D.md", "gone soon");
        await Open();
        await Call("notesFolder:deleteNote", path);
        Assert.False(File.Exists(path));
        Assert.Single((await Call("notesFolder:getNoteHistory", path))!.AsArray());
    }

    [Fact]
    public async Task SeedStarterContentSkipsExistingFiles()
    {
        Write("Welcome.md", "mine");
        await Open();
        var created = (await Call("notesFolder:seedStarterContent"))!.AsArray();
        Assert.Equal(new[] { Path.Combine(_root, "Example Note.md") }, created.Select(c => (string)c!));
        Assert.Equal("mine", File.ReadAllText(Path.Combine(_root, "Welcome.md")));
    }

    [Fact]
    public async Task CreateMakesAManagedFolderUnderTheNotesRoot()
    {
        var list = (await Call("notesFolders:create", "My/Work"))!.AsArray();
        var expected = Path.Combine(_tmp, "notes", "My-Work");
        Assert.Equal("My/Work", (string)list[0]!["name"]!);
        Assert.Equal(expected, (string)list[0]!["root"]!);
        Assert.True(Directory.Exists(expected));

        // Persisted by directory name only, so the registry isn't pinned to this machine's paths.
        var onDisk = System.Text.Json.Nodes.JsonNode.Parse(File.ReadAllText(Path.Combine(_userData, "notesFolders.json")))!.AsArray();
        Assert.Equal("My-Work", (string)onDisk[0]!["dir"]!);
        Assert.Null(onDisk[0]!["root"]);

        await Assert.ThrowsAsync<InvalidOperationException>(() => Call("notesFolders:create", "my/work"));
        // A renamed folder keeps its directory, and a new folder with the old name gets a fresh one.
        await Call("notesFolders:rename", "My/Work", "Job");
        var again = (await Call("notesFolders:create", "My/Work"))!.AsArray();
        Assert.Equal(Path.Combine(_tmp, "notes", "My-Work-2"), (string)again[1]!["root"]!);
    }

    [Fact]
    public async Task RegistryFlowKeepsCliAccessInSync()
    {
        var list = (await Call("notesFolders:add", "Work", _root))!.AsArray();
        Assert.Equal("Work", (string)list[0]!["name"]!);
        Assert.Equal("builtin", (string)list[0]!["avatar"]!["kind"]!);

        await Assert.ThrowsAsync<InvalidOperationException>(() => Call("notesFolders:add", "work", _root));
        await Call("cliAccess:set", "Work", true);
        await Call("notesFolders:rename", "Work", "Job");
        Assert.Equal(new[] { "Job" }, (await Call("cliAccess:list"))!.AsArray().Select(x => (string)x!));
        await Call("notesFolders:remove", "Job");
        Assert.Empty((await Call("cliAccess:list"))!.AsArray());
        Assert.Empty((await Call("notesFolders:list"))!.AsArray());
    }

    [Fact]
    public async Task SettingsAreNormalizedOnRead()
    {
        var defaults = (JsonObject)(await Call("settings:read"))!;
        Assert.Equal("dark", (string)defaults["theme"]!);

        await Call("settings:save", new JsonObject { ["theme"] = "light", ["editorFontSize"] = 99 });
        var saved = (JsonObject)(await Call("settings:read"))!;
        Assert.Equal("light", (string)saved["theme"]!);
        Assert.Equal(28, (double)saved["editorFontSize"]!);
    }

    [Fact]
    public async Task SearchStreamsResultsAndFinishes()
    {
        Write("S1.md", "needle here\nand needle there");
        Write("S2.md", "nothing");
        await Open();
        var searchId = (string)(await Call("search:start", new JsonObject { ["query"] = "needle", ["mode"] = "plain", ["wholeWord"] = false }))!;

        for (var i = 0; i < 100 && !_events.Any(e => e.Channel == "search:done"); i++) await Task.Delay(20);
        var results = _events.Where(e => e.Channel == "search:result").ToList();
        Assert.Single(results);
        Assert.Equal(searchId, (string)results[0].Payload!["searchId"]!);
        Assert.Equal(2, results[0].Payload!["result"]!["matches"]!.AsArray().Count);

        var replaced = (JsonObject)(await Call("search:replaceAll",
            new JsonObject { ["query"] = "needle", ["mode"] = "plain", ["wholeWord"] = false }, "pin"))!;
        Assert.Equal(1, (int)replaced["filesChanged"]!);
        Assert.Equal(2, (int)replaced["replacements"]!);
    }

    [Fact]
    public async Task WorkspaceStatePersistsPerFolder()
    {
        await Open();
        await Call("notesFolder:saveWorkspaceState", new JsonObject
        {
            ["openTabs"] = new JsonArray("@graph", new JsonObject { ["root"] = _root, ["relativePath"] = "a.md" }),
            ["activeTab"] = "@graph",
        });
        var state = (JsonObject)(await Call("notesFolder:readWorkspaceState"))!;
        Assert.Equal(2, state["openTabs"]!.AsArray().Count);
        Assert.Equal("@graph", (string)state["activeTab"]!);
        Assert.True(File.Exists(Path.Combine(_root, ".cairn", "workspace.json")));
    }

    [Fact]
    public async Task AttachmentsRoundTrip()
    {
        var note = Write("sub/Doc.md", "![x](../attachments/pic.png) ![y](../attachments/kept.png)");
        await Open();
        var b64 = Convert.ToBase64String(new byte[] { 1, 2, 3 });
        var rel1 = (string)(await Call("attachments:save", "pic.png", new JsonObject { ["__bin"] = b64, ["type"] = "ArrayBuffer" }))!;
        var rel2 = (string)(await Call("attachments:save", "pic.png", new JsonObject { ["__bin"] = b64, ["type"] = "ArrayBuffer" }))!;
        Assert.Equal("attachments/pic.png", rel1);
        Assert.Equal("attachments/pic 1.png", rel2);

        var orphans = (await Call("attachments:findOrphaned", _root))!.AsArray().Select(x => (string)x!).ToList();
        Assert.Equal(new[] { "attachments/pic 1.png" }, orphans);

        var data = (JsonObject)(await Call("attachments:readManyAsDataUrls", _root, new JsonArray("attachments/pic.png", "../escape.png", "missing.png")))!;
        Assert.Equal("data:image/png;base64," + b64, (string)data["attachments/pic.png"]!);
        Assert.Single(data);

        await Call("attachments:deleteOrphaned", _root, new JsonArray("attachments/pic 1.png"));
        Assert.False(File.Exists(Path.Combine(_root, "attachments", "pic 1.png")));
        _ = note;
    }

    [Fact]
    public async Task TasksAndDailyNotes()
    {
        await Open();
        var taskPath = (string)(await Call("tasks:create", "Write: the report?", "2026-02-03", "todo"))!;
        Assert.Equal(Path.Combine(_root, "Tasks", "Write- the report-.md"), taskPath);
        Assert.Equal("---\nstatus: todo\ndeadline: '2026-02-03'\n---\n# Write: the report?\n", File.ReadAllText(taskPath));
        await Assert.ThrowsAsync<InvalidOperationException>(() => Call("tasks:create", "x", "not-a-date", "todo"));
        await Assert.ThrowsAsync<InvalidOperationException>(() => Call("tasks:create", "  ", null, "todo"));

        var daily = (JsonObject)(await Call("notesFolder:openOrCreateDailyNote", _root))!;
        Assert.True((bool)daily["created"]!);
        Assert.True(File.Exists((string)daily["path"]!));
        var again = (JsonObject)(await Call("notesFolder:openOrCreateDailyNote", _root))!;
        Assert.False((bool)again["created"]!);
    }

    [Fact]
    public async Task TemplatesFromTemplateFolder()
    {
        var tpl = Write(".templates/Standup.md", "# {{title}}\nBy {{who}} on {{date:YYYY}}\n");
        await Call("notesFolders:add", "V", _root);
        await Open();

        var list = (await Call("templates:list"))!.AsArray();
        Assert.Equal("Standup", (string)list[0]!["name"]!);
        var made = (string)(await Call("templates:createNote", _root, "Monday", tpl, new JsonObject { ["who"] = "Sam" }))!;
        Assert.Equal($"# Monday\nBy Sam on {DateTime.Now.Year}\n", File.ReadAllText(made));

        var converted = (string)(await Call("templates:convert", _root, made))!;
        Assert.Equal(Path.Combine(_root, ".templates", "Monday.md"), converted);
    }

    [Fact]
    public async Task ExternalUrlsAreGatedByScheme()
    {
        Assert.True((bool)(await Call("shell:openExternal", "https://example.com"))!);
        Assert.False((bool)(await Call("shell:openExternal", "file:///etc/passwd"))!);
        Assert.False((bool)(await Call("shell:openExternal", "javascript:alert(1)"))!);
        Assert.Equal(new[] { "https://example.com" }, _platform.OpenedUrls);
    }

    [Fact]
    public async Task PropertySchemaIsStoredAsYaml()
    {
        var schema = new JsonArray(
            new JsonObject { ["name"] = "Rating", ["type"] = "number", ["rules"] = new JsonObject { ["min"] = 1, ["max"] = 5 } },
            new JsonObject { ["name"] = "Tags", ["type"] = "list" });
        await Call("notesFolder:savePropertySchema", _root, schema);
        Assert.Equal(
            "properties:\n  - name: Rating\n    type: number\n    rules:\n      min: 1\n      max: 5\n  - name: Tags\n    type: list\n",
            File.ReadAllText(Path.Combine(_root, ".cairn", "properties.yaml")));
        var back = (await Call("notesFolder:readPropertySchema", _root))!.AsArray();
        Assert.Equal(2, back.Count);
        Assert.Equal(5, (long)back[0]!["rules"]!["max"]!);
    }
}
