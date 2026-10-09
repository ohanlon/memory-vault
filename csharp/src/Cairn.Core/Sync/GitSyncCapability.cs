using System.Text.Json.Nodes;
using System.Text.RegularExpressions;
using Cairn.Core.Storage;

namespace Cairn.Core.Sync;

public sealed record FolderRef(string Name, string Root);

/// <summary>Everything the capability needs from the host; delegates keep it free of router internals and easy to fake.</summary>
public sealed record GitSyncEnv(
    HttpClient Http,
    string ClientId,
    string SyncConfigFile,
    ISecretStore Secrets,
    Func<string, bool> IsPluginEnabled,
    Func<string, bool> HasGitSyncPermission,
    Func<FolderRef?> ActiveFolder,
    Func<IReadOnlyList<FolderRef>> RegisteredFolders,
    /// <summary>Opens a URL in the user's browser. Only ever called with GitHub's device-flow page.</summary>
    Func<string, Task> OpenExternal,
    /// <summary>Replaces the real wait between sign-in polls; tests pass an instant one.</summary>
    Func<TimeSpan, CancellationToken, Task>? PollDelay = null);

/// <summary>
/// The host-side half of the GitHub sync plugin (port of electron/gitSyncCapability.ts). The plugin runs in a
/// sandboxed iframe and reaches GitHub and the token only through plugin:invoke, which is gated on the plugin being
/// enabled AND holding the "git-sync" permission; it acts only on the active notes folder (the plugin never supplies a
/// filesystem path) and never receives the token, only { connected, login }.
/// </summary>
public sealed class GitSyncCapability
{
    private static readonly Regex RepoRe = new(@"^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$", RegexOptions.CultureInvariant);
    private static readonly Regex RepoNameRe = new(@"^[A-Za-z0-9_.-]+$", RegexOptions.CultureInvariant);
    private static readonly Regex BranchRe = new(@"^[A-Za-z0-9_./-]+$", RegexOptions.CultureInvariant);

    private readonly GitSyncEnv _env;
    private readonly GithubClient _github;
    private readonly GitSyncEngine _engine;
    private readonly Dictionary<string, Func<JsonArray, Task<JsonNode?>>> _handlers;
    private readonly HashSet<string> _syncing = new();
    private (DeviceFlowStart Start, CancellationTokenSource Cancel)? _pendingAuth;

    public GitSyncCapability(GitSyncEnv env)
    {
        _env = env;
        _github = new GithubClient(env.Http);
        _engine = new GitSyncEngine(_github);
        _handlers = new Dictionary<string, Func<JsonArray, Task<JsonNode?>>>(StringComparer.Ordinal)
        {
            ["auth.status"] = _ => AuthStatusAsync(),
            ["auth.start"] = _ => AuthStartAsync(),
            ["auth.await"] = _ => AuthAwaitAsync(),
            ["auth.cancel"] = _ => { CancelPendingAuth(); return Task.FromResult<JsonNode?>(JsonValue.Create(true)); },
            ["auth.disconnect"] = async _ =>
            {
                await GithubAuth.DeleteTokenAsync(_env.Secrets);
                return Status(false, null);
            },
            ["repo.list"] = async _ => new JsonArray((await _github.ListReposAsync(await TokenAsync())).Select(r => (JsonNode?)RepoJson(r)).ToArray()),
            ["repo.create"] = RepoCreateAsync,
            ["folder.get"] = _ => Task.FromResult<JsonNode?>(FolderGet()),
            ["link.set"] = LinkSetAsync,
            ["link.remove"] = _ => Task.FromResult<JsonNode?>(LinkRemove()),
            ["sync.status"] = _ => SyncStatusAsync(),
            ["sync.pull"] = _ => RunSyncAsync(RequireFolder(), pullOnly: true, null, null),
            ["sync.commitPush"] = CommitPushAsync,
            ["sync.fetchAll"] = _ => FetchAllAsync(),
        };
    }

    public IReadOnlyCollection<string> Methods => _handlers.Keys;

    public async Task<JsonNode?> DispatchAsync(string pluginId, string method, JsonArray args)
    {
        if (!_env.IsPluginEnabled(pluginId)) throw new InvalidOperationException("This plugin is disabled.");
        if (!_env.HasGitSyncPermission(pluginId)) throw new InvalidOperationException("This plugin has not been granted the \"git-sync\" permission.");
        if (!_handlers.TryGetValue(method, out var handler)) throw new InvalidOperationException($"Unknown method \"{method}\"");
        return await handler(args);
    }

    // ---- helpers ---------------------------------------------------------------------------------------

    private static JsonObject Status(bool connected, string? login) => new() { ["connected"] = connected, ["login"] = login };

    private static JsonObject RepoJson(GithubRepo r) => new()
    {
        ["fullName"] = r.FullName,
        ["defaultBranch"] = r.DefaultBranch,
        ["private"] = r.Private,
    };

    private static JsonObject ResultJson(SyncResult r) => new()
    {
        ["status"] = r.Status,
        ["message"] = r.Message,
        ["committed"] = r.Committed,
        ["pushed"] = r.Pushed,
        ["pulled"] = r.Pulled,
    };

    private async Task<string> TokenAsync() =>
        await GithubAuth.ReadTokenAsync(_env.Secrets) ?? throw new InvalidOperationException("Not connected to GitHub. Connect GitHub first.");

    private FolderRef RequireFolder() => _env.ActiveFolder() ?? throw new InvalidOperationException("Open a notes folder first.");

    private JsonObject? LinkFor(string folderName) =>
        SyncConfig.Read(_env.SyncConfigFile).FirstOrDefault(kv => string.Equals(kv.Key, folderName, StringComparison.OrdinalIgnoreCase)).Value as JsonObject;

    private JsonObject RequireLink(FolderRef folder) =>
        LinkFor(folder.Name) ?? throw new InvalidOperationException("This notes folder isn't connected to a GitHub repository.");

    private void SaveLink(string folderName, JsonObject link)
    {
        var config = SyncConfig.Remove(SyncConfig.Read(_env.SyncConfigFile), folderName);
        config[folderName] = link;
        SyncConfig.Write(_env.SyncConfigFile, config);
    }

    private static string RepoOf(JsonObject link) => link["repoFullName"]!.GetValue<string>();
    private static string BranchOf(JsonObject link) => link["branch"]!.GetValue<string>();

    private void CancelPendingAuth()
    {
        _pendingAuth?.Cancel.Cancel();
    }

    // ---- auth ------------------------------------------------------------------------------------------

    private async Task<JsonNode?> AuthStatusAsync()
    {
        var token = await GithubAuth.ReadTokenAsync(_env.Secrets);
        if (token is null) return Status(false, null);
        try { return Status(true, await _github.GetUserLoginAsync(token)); }
        catch (Exception e) when (e is not OperationCanceledException) { return Status(true, null); } // offline or revoked; the next real call surfaces it
    }

    private async Task<JsonNode?> AuthStartAsync()
    {
        CancelPendingAuth();
        var start = await GithubAuth.StartDeviceFlowAsync(_env.Http, _env.ClientId);
        _pendingAuth = (start, new CancellationTokenSource());
        await _env.OpenExternal(start.VerificationUri);
        return new JsonObject { ["userCode"] = start.UserCode, ["verificationUri"] = start.VerificationUri };
    }

    // Long-running: resolves once the user has authorised in the browser.
    private async Task<JsonNode?> AuthAwaitAsync()
    {
        var flow = _pendingAuth ?? throw new InvalidOperationException("Sign-in was not started.");
        try
        {
            var token = await GithubAuth.PollForTokenAsync(_env.Http, _env.ClientId, flow.Start, flow.Cancel.Token, _env.PollDelay);
            await GithubAuth.WriteTokenAsync(_env.Secrets, token);
            return await AuthStatusAsync();
        }
        finally
        {
            if (_pendingAuth is { } current && current.Cancel == flow.Cancel) _pendingAuth = null;
        }
    }

    // ---- repositories and links --------------------------------------------------------------------------

    private async Task<JsonNode?> RepoCreateAsync(JsonArray args)
    {
        if (args.Count < 1 || args[0] is not JsonValue n || !n.TryGetValue<string>(out var name) || !RepoNameRe.IsMatch(name))
            throw new InvalidOperationException("Repository names may only contain letters, numbers, '.', '-' and '_'.");
        var isPrivate = !(args.Count > 1 && args[1] is JsonValue p && p.TryGetValue<bool>(out var b) && !b); // private unless explicitly false
        return RepoJson(await _github.CreateRepoAsync(await TokenAsync(), name, isPrivate));
    }

    private JsonNode? FolderGet()
    {
        var folder = _env.ActiveFolder();
        return folder is null ? null : new JsonObject { ["name"] = folder.Name, ["link"] = LinkFor(folder.Name)?.DeepClone() };
    }

    private Task<JsonNode?> LinkSetAsync(JsonArray args)
    {
        var folder = RequireFolder();
        if (args.Count < 1 || args[0] is not JsonValue r || !r.TryGetValue<string>(out var repo) || !RepoRe.IsMatch(repo))
            throw new InvalidOperationException("Invalid repository.");
        if (args.Count < 2 || args[1] is not JsonValue b || !b.TryGetValue<string>(out var branch) || !BranchRe.IsMatch(branch))
            throw new InvalidOperationException("Invalid branch.");
        var link = new JsonObject { ["repoFullName"] = repo, ["branch"] = branch };
        SaveLink(folder.Name, link);
        return Task.FromResult<JsonNode?>(link.DeepClone());
    }

    private JsonNode? LinkRemove()
    {
        var folder = RequireFolder();
        SyncConfig.Write(_env.SyncConfigFile, SyncConfig.Remove(SyncConfig.Read(_env.SyncConfigFile), folder.Name));
        return JsonValue.Create(true);
    }

    // ---- syncing ---------------------------------------------------------------------------------------

    private Task<JsonNode?> SyncStatusAsync()
    {
        var folder = RequireFolder();
        var link = LinkFor(folder.Name);
        if (link is null) return Task.FromResult<JsonNode?>(new JsonObject { ["folder"] = folder.Name, ["link"] = null, ["changes"] = new JsonArray() });

        var changes = SyncLocal.ListChanges(folder.Root, SyncLocal.ReadState(folder.Root, RepoOf(link), BranchOf(link)));
        return Task.FromResult<JsonNode?>(new JsonObject
        {
            ["folder"] = folder.Name,
            ["link"] = link.DeepClone(),
            ["changes"] = new JsonArray(changes.Select(c => (JsonNode?)new JsonObject { ["path"] = c.Path, ["state"] = c.State }).ToArray()),
        });
    }

    private async Task<JsonNode?> CommitPushAsync(JsonArray args)
    {
        var folder = RequireFolder();
        var link = RequireLink(folder);
        if (args.Count < 1 || args[0] is not JsonArray paths || paths.Any(p => p is not JsonValue v || !v.TryGetValue<string>(out _)))
            throw new InvalidOperationException("Invalid file selection.");
        string? message = null;
        if (args.Count > 1 && args[1] is not null)
        {
            if (args[1] is not JsonValue m || !m.TryGetValue<string>(out message)) throw new InvalidOperationException("Invalid commit message.");
        }

        // Only files that genuinely have changes may be named; this also rules out "../" paths.
        var known = SyncLocal.ListChanges(folder.Root, SyncLocal.ReadState(folder.Root, RepoOf(link), BranchOf(link))).Select(c => c.Path).ToHashSet();
        var selected = paths.Select(p => p!.GetValue<string>()).Distinct().ToList();
        var unknown = selected.FirstOrDefault(p => !known.Contains(p));
        if (unknown is not null) throw new InvalidOperationException($"Not a changed file: {unknown}");
        return await RunSyncAsync(folder, pullOnly: false, selected, message);
    }

    // Pull-only across every linked notes folder; one failing doesn't stop the rest.
    private async Task<JsonNode?> FetchAllAsync()
    {
        var config = SyncConfig.Read(_env.SyncConfigFile);
        var output = new JsonArray();
        foreach (var folder in _env.RegisteredFolders())
        {
            if (!config.Any(kv => string.Equals(kv.Key, folder.Name, StringComparison.OrdinalIgnoreCase))) continue;
            JsonNode? result;
            try
            {
                result = await RunSyncAsync(folder, pullOnly: true, null, null);
            }
            catch (Exception e) when (e is not OperationCanceledException)
            {
                result = ResultJson(new SyncResult("error", e.Message, false, false, false));
            }
            output.Add(new JsonObject { ["name"] = folder.Name, ["result"] = result });
        }
        return output;
    }

    private async Task<JsonNode?> RunSyncAsync(FolderRef folder, bool pullOnly, IReadOnlyList<string>? paths, string? message)
    {
        var link = RequireLink(folder);
        lock (_syncing)
        {
            if (!_syncing.Add(folder.Root)) throw new InvalidOperationException("A sync is already running for this folder.");
        }
        try
        {
            var token = await TokenAsync();
            var login = await _github.GetUserLoginAsync(token);
            var result = await _engine.SyncAsync(new SyncOptions(
                folder.Root, RepoOf(link), BranchOf(link), token, login, $"{login}@users.noreply.github.com", pullOnly, paths, message));

            var updated = (JsonObject)link.DeepClone();
            updated["lastSyncAt"] = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds();
            updated["lastStatus"] = result.Status;
            updated["lastMessage"] = result.Message;
            SaveLink(folder.Name, updated);
            return ResultJson(result);
        }
        finally
        {
            lock (_syncing) _syncing.Remove(folder.Root);
        }
    }
}
