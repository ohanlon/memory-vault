using System.Text.Json.Nodes;
using Cairn.Core.Sync;
using Xunit;

namespace Cairn.Core.Tests;

public sealed class GitSyncCapabilityTests : IDisposable
{
    private readonly string _tmp = Path.Combine(Path.GetTempPath(), "cairn-capability-" + Guid.NewGuid().ToString("N"));
    private readonly FakeGithub _github = new();
    private readonly MemorySecretStore _secrets = new();
    private readonly List<string> _opened = new();
    private readonly List<FolderRef> _registered = new();
    private readonly GitSyncCapability _capability;
    private readonly string _configFile;
    private bool _enabled = true;
    private bool _permitted = true;
    private FolderRef? _active;
    private Func<TimeSpan, CancellationToken, Task> _pollDelay = (_, _) => Task.CompletedTask;

    public GitSyncCapabilityTests()
    {
        Directory.CreateDirectory(_tmp);
        _configFile = Path.Combine(_tmp, "sync-config.json");
        _capability = new GitSyncCapability(new GitSyncEnv(
            new HttpClient(_github),
            "client",
            _configFile,
            _secrets,
            _ => _enabled,
            _ => _permitted,
            () => _active,
            () => _registered,
            url => { _opened.Add(url); return Task.CompletedTask; },
            (span, ct) => _pollDelay(span, ct)));
    }

    public void Dispose()
    {
        try { Directory.Delete(_tmp, recursive: true); } catch (IOException) { }
    }

    private async Task<JsonNode?> Call(string method, params object?[] args)
    {
        var arr = new JsonArray();
        foreach (var a in args)
            arr.Add(a switch
            {
                null => null,
                JsonNode n => n,
                string s => JsonValue.Create(s),
                bool b => JsonValue.Create(b),
                string[] list => new JsonArray(list.Select(x => (JsonNode?)JsonValue.Create(x)).ToArray()),
                _ => throw new ArgumentException("unsupported test argument"),
            });
        return await _capability.DispatchAsync("github-sync", method, arr);
    }

    private async Task<string> ErrorOf(string method, params object?[] args) =>
        (await Assert.ThrowsAsync<InvalidOperationException>(() => Call(method, args))).Message;

    private async Task SignIn()
    {
        await _secrets.SetAsync(GithubAuth.TokenKey, "gho_secret");
    }

    private FolderRef OpenFolder(string name = "Work")
    {
        var root = Path.Combine(_tmp, name);
        Directory.CreateDirectory(root);
        var folder = new FolderRef(name, root);
        _registered.Add(folder);
        _active = folder;
        return folder;
    }

    private static void Write(FolderRef folder, string relative, string content)
    {
        var full = Path.Combine(folder.Root, relative);
        Directory.CreateDirectory(Path.GetDirectoryName(full)!);
        File.WriteAllText(full, content);
    }

    // ---- the gate --------------------------------------------------------------------------------------

    [Fact]
    public async Task ADisabledPluginIsRefusedBeforeAnythingElse()
    {
        _enabled = false;
        Assert.Equal("This plugin is disabled.", await ErrorOf("auth.status"));
    }

    [Fact]
    public async Task APluginWithoutTheGitSyncPermissionIsRefused()
    {
        _permitted = false;
        Assert.Contains("\"git-sync\" permission", await ErrorOf("auth.status"));
    }

    [Theory]
    [InlineData("nope")]
    [InlineData("constructor")]
    [InlineData("__proto__")]
    [InlineData("")]
    public async Task UnknownMethodsAreRefused(string method) =>
        Assert.Contains("Unknown method", await ErrorOf(method));

    [Fact]
    public void ExposesExactlyTheMethodsThePluginCalls()
    {
        Assert.Equal(
            new[]
            {
                "auth.await", "auth.cancel", "auth.disconnect", "auth.start", "auth.status", "folder.get", "link.remove", "link.set",
                "repo.create", "repo.list", "sync.commitPush", "sync.fetchAll", "sync.pull", "sync.status",
            },
            _capability.Methods.OrderBy(m => m, StringComparer.Ordinal));
    }

    // ---- sign-in ---------------------------------------------------------------------------------------

    [Fact]
    public async Task StatusIsDisconnectedWithoutAToken()
    {
        var status = (await Call("auth.status"))!;
        Assert.False((bool)status["connected"]!);
        Assert.Null(status["login"]);
    }

    [Fact]
    public async Task StatusReportsTheLoginButNeverTheToken()
    {
        await SignIn();

        var json = (await Call("auth.status"))!.ToJsonString();

        Assert.Contains("octo", json);
        Assert.DoesNotContain("gho_secret", json);
        Assert.Equal(new[] { "connected", "login" }, ((JsonObject)JsonNode.Parse(json)!).Select(kv => kv.Key).OrderBy(k => k));
    }

    [Fact]
    public async Task ARevokedTokenStillReportsConnectedWithoutALogin()
    {
        await _secrets.SetAsync(GithubAuth.TokenKey, ""); // GitHub's fake rejects an empty bearer token with 401

        var status = (await Call("auth.status"))!;

        Assert.True((bool)status["connected"]!);
        Assert.Null(status["login"]);
    }

    [Fact]
    public async Task SigningInOpensGithubsPageStoresTheTokenAndNeverReturnsIt()
    {
        _github.TokenResponses.Enqueue(new JsonObject { ["error"] = "authorization_pending" });
        _github.TokenResponses.Enqueue(new JsonObject { ["access_token"] = "gho_secret" });

        var started = (await Call("auth.start"))!;
        var finished = (await Call("auth.await"))!;

        Assert.Equal("ABCD-1234", (string)started["userCode"]!);
        Assert.Equal(new[] { "https://github.com/login/device" }, _opened);
        Assert.True((bool)finished["connected"]!);
        Assert.Equal("octo", (string)finished["login"]!);
        Assert.Equal("gho_secret", _secrets.Values[GithubAuth.TokenKey]);
        Assert.DoesNotContain("gho_secret", started.ToJsonString() + finished.ToJsonString());
    }

    [Fact]
    public async Task AwaitingWithoutStartingIsAnError() =>
        Assert.Equal("Sign-in was not started.", await ErrorOf("auth.await"));

    [Fact]
    public async Task CancellingAbortsAPendingSignIn()
    {
        _pollDelay = (_, ct) => Task.Delay(Timeout.Infinite, ct);
        await Call("auth.start");
        var waiting = Call("auth.await");

        await Call("auth.cancel");

        Assert.Equal("Sign-in cancelled", (await Assert.ThrowsAsync<InvalidOperationException>(() => waiting)).Message);
        Assert.Empty(_secrets.Values);
    }

    [Fact]
    public async Task SigningInFailsClearlyWhenSecureStorageIsUnavailable()
    {
        _secrets.IsAvailable = false;
        _github.TokenResponses.Enqueue(new JsonObject { ["access_token"] = "gho_secret" });
        await Call("auth.start");

        Assert.Contains("Secure storage is not available", await ErrorOf("auth.await"));
        Assert.Empty(_secrets.Values);
    }

    [Fact]
    public async Task DisconnectingForgetsTheToken()
    {
        await SignIn();

        var status = (await Call("auth.disconnect"))!;

        Assert.False((bool)status["connected"]!);
        Assert.Empty(_secrets.Values);
    }

    // ---- repositories ----------------------------------------------------------------------------------

    [Fact]
    public async Task ListingReposNeedsAConnection()
    {
        Assert.Equal("Not connected to GitHub. Connect GitHub first.", await ErrorOf("repo.list"));

        await SignIn();
        _github.AddRepo("octo/notes", "trunk");
        var repos = (JsonArray)(await Call("repo.list"))!;

        Assert.Equal("octo/notes", (string)repos[0]!["fullName"]!);
        Assert.Equal("trunk", (string)repos[0]!["defaultBranch"]!);
        Assert.True((bool)repos[0]!["private"]!);
    }

    [Theory]
    [InlineData("has space")]
    [InlineData("a/b")]
    [InlineData("")]
    [InlineData("../x")]
    public async Task RepoNamesAreValidatedBeforeAnyRequest(string name)
    {
        await SignIn();
        Assert.Contains("Repository names may only contain", await ErrorOf("repo.create", name));
        Assert.DoesNotContain(_github.Requests, r => r.StartsWith("POST"));
    }

    [Fact]
    public async Task NewReposArePrivateUnlessSaidOtherwise()
    {
        await SignIn();

        await Call("repo.create", "secret-notes");
        await Call("repo.create", "open-notes", false);

        Assert.True(_github.Repos["octo/secret-notes"].Private);
        Assert.False(_github.Repos["octo/open-notes"].Private);
    }

    // ---- links -----------------------------------------------------------------------------------------

    [Fact]
    public async Task FolderGetIsNullWithNoFolderOpenAndHasNoLinkUntilOneIsSet()
    {
        Assert.Null(await Call("folder.get"));

        OpenFolder();
        var folder = (await Call("folder.get"))!;

        Assert.Equal("Work", (string)folder["name"]!);
        Assert.Null(folder["link"]);
    }

    [Fact]
    public async Task LinksNeedAnOpenFolder()
    {
        Assert.Equal("Open a notes folder first.", await ErrorOf("link.set", "octo/notes", "main"));
        Assert.Equal("Open a notes folder first.", await ErrorOf("link.remove"));
        Assert.Equal("Open a notes folder first.", await ErrorOf("sync.status"));
    }

    [Theory]
    [InlineData("noslash", "main", "Invalid repository.")]
    [InlineData("a/b/c", "main", "Invalid repository.")]
    [InlineData("a b/c", "main", "Invalid repository.")]
    [InlineData("octo/notes", "bad branch", "Invalid branch.")]
    [InlineData("octo/notes", "", "Invalid branch.")]
    public async Task LinkInputsAreValidated(string repo, string branch, string expected)
    {
        OpenFolder();
        Assert.Equal(expected, await ErrorOf("link.set", repo, branch));
        Assert.False(File.Exists(_configFile));
    }

    [Fact]
    public async Task ALinkIsSavedPerFolderAndCanBeRemoved()
    {
        OpenFolder();

        var link = (await Call("link.set", "octo/notes", "main"))!;
        var folder = (await Call("folder.get"))!;

        Assert.Equal("octo/notes", (string)link["repoFullName"]!);
        Assert.Equal("main", (string)folder["link"]!["branch"]!);

        await Call("link.remove");
        Assert.Null((await Call("folder.get"))!["link"]);
    }

    // ---- syncing ---------------------------------------------------------------------------------------

    [Fact]
    public async Task StatusListsChangesOnlyOnceLinked()
    {
        var folder = OpenFolder();
        Write(folder, "a.md", "alpha");

        var unlinked = (await Call("sync.status"))!;
        Assert.Null(unlinked["link"]);
        Assert.Empty((JsonArray)unlinked["changes"]!);

        await Call("link.set", "octo/notes", "main");
        var linked = (await Call("sync.status"))!;
        var changes = (JsonArray)linked["changes"]!;

        Assert.Equal("a.md", (string)changes[0]!["path"]!);
        Assert.Equal("added", (string)changes[0]!["state"]!);
    }

    [Fact]
    public async Task SyncingNeedsALinkAndAConnection()
    {
        OpenFolder();
        Assert.Contains("isn't connected to a GitHub repository", await ErrorOf("sync.pull"));

        await Call("link.set", "octo/notes", "main");
        Assert.Equal("Not connected to GitHub. Connect GitHub first.", await ErrorOf("sync.pull"));
    }

    [Fact]
    public async Task CommitPushRefusesPathsThatAreNotChanges()
    {
        var folder = OpenFolder();
        Write(folder, "a.md", "alpha");
        await Call("link.set", "octo/notes", "main");
        await SignIn();

        Assert.Equal("Not a changed file: nope.md", await ErrorOf("sync.commitPush", new[] { "a.md", "nope.md" }, "msg"));
        Assert.Equal("Not a changed file: ../escape.md", await ErrorOf("sync.commitPush", new[] { "../escape.md" }, null));
        Assert.Equal("Invalid file selection.", await ErrorOf("sync.commitPush", "not-an-array", null));
        Assert.Equal("Invalid commit message.", await ErrorOf("sync.commitPush", new[] { "a.md" }, JsonValue.Create(5)));
        Assert.DoesNotContain(_github.Requests, r => r.StartsWith("POST") || r.StartsWith("PUT"));
    }

    [Fact]
    public async Task CommitPushPushesTheChosenFilesAndRecordsTheOutcomeOnTheLink()
    {
        var folder = OpenFolder();
        var repo = _github.AddRepo("octo/notes");
        Write(folder, "a.md", "alpha");
        Write(folder, "b.md", "beta");
        await Call("link.set", "octo/notes", "main");
        await SignIn();

        var result = (await Call("sync.commitPush", new[] { "a.md" }, "Add alpha"))!;

        Assert.Equal("synced", (string)result["status"]!);
        Assert.True((bool)result["pushed"]!);
        Assert.Equal(new[] { "a.md" }, repo.FilesAt("main").Keys);
        var link = (await Call("folder.get"))!["link"]!;
        Assert.Equal("synced", (string)link["lastStatus"]!);
        Assert.True((long)link["lastSyncAt"]! > 0);
    }

    [Fact]
    public async Task PullBringsDownGithubsFiles()
    {
        var folder = OpenFolder();
        _github.AddRepo("octo/notes", files: new Dictionary<string, string> { ["from-github.md"] = "hi" });
        await Call("link.set", "octo/notes", "main");
        await SignIn();

        var result = (await Call("sync.pull"))!;

        Assert.True((bool)result["pulled"]!);
        Assert.Equal("hi", File.ReadAllText(Path.Combine(folder.Root, "from-github.md")));
    }

    [Fact]
    public async Task FetchAllPullsEveryLinkedFolderAndOneFailureDoesNotStopTheRest()
    {
        await SignIn();
        var good = OpenFolder("Good");
        var broken = OpenFolder("Broken");
        OpenFolder("Unlinked");
        _github.AddRepo("octo/good", files: new Dictionary<string, string> { ["x.md"] = "x" });
        _active = good;
        await Call("link.set", "octo/good", "main");
        _active = broken;
        await Call("link.set", "octo/missing", "main"); // no such repo on the fake GitHub

        var results = (JsonArray)(await Call("sync.fetchAll"))!;

        Assert.Equal(new[] { "Good", "Broken" }, results.Select(r => (string)r!["name"]!));
        Assert.Equal("synced", (string)results[0]!["result"]!["status"]!);
        Assert.Equal("error", (string)results[1]!["result"]!["status"]!);
        Assert.True(File.Exists(Path.Combine(good.Root, "x.md")));
    }
}
