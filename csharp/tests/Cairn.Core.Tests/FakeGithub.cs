using System.Net;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;
using Cairn.Core.Sync;

namespace Cairn.Core.Tests;

internal sealed class MemorySecretStore : ISecretStore
{
    public Dictionary<string, string> Values { get; } = new();
    public bool IsAvailable { get; set; } = true;
    public Task<string?> GetAsync(string key) => Task.FromResult(Values.GetValueOrDefault(key));
    public Task SetAsync(string key, string value) { Values[key] = value; return Task.CompletedTask; }
    public Task DeleteAsync(string key) { Values.Remove(key); return Task.CompletedTask; }
}

/// <summary>
/// An in-memory GitHub: just the endpoints the sync client calls, with git's real blob hashing, so the engine can be
/// tested end to end without a network or an account. It encodes my reading of GitHub's documented API behavior (a real
/// GitHub is the final check), including the empty-repository 409 and the fast-forward-only branch update.
/// </summary>
internal sealed class FakeGithub : HttpMessageHandler
{
    public sealed record Commit(string Tree, string? Parent, string Message, string AuthorName);

    public sealed class Repo(string name, string defaultBranch)
    {
        public string Name { get; } = name;
        public string DefaultBranch { get; } = defaultBranch;
        public bool Private { get; set; } = true;
        public Dictionary<string, Commit> Commits { get; } = new();
        public Dictionary<string, Dictionary<string, string>> Trees { get; } = new(); // tree sha -> path -> blob sha
        public Dictionary<string, byte[]> Blobs { get; } = new();
        public Dictionary<string, string> Branches { get; } = new(); // branch -> commit sha

        public string? Head(string branch) => Branches.GetValueOrDefault(branch);
        public Dictionary<string, string> FilesAt(string branch) => Trees[Commits[Branches[branch]].Tree];
        public string TextOf(string branch, string path) => Encoding.UTF8.GetString(Blobs[FilesAt(branch)[path]]);
    }

    public Dictionary<string, Repo> Repos { get; } = new(StringComparer.OrdinalIgnoreCase);
    public List<string> Requests { get; } = new();
    public string Login { get; set; } = "octo";
    public Queue<JsonObject> TokenResponses { get; } = new();
    public bool RejectNextBranchUpdate { get; set; }
    private int _counter;

    // ---- test setup ------------------------------------------------------------------------------------

    public Repo AddRepo(string fullName, string branch = "main", IDictionary<string, string>? files = null)
    {
        var repo = new Repo(fullName, branch);
        Repos[fullName] = repo;
        if (files is not null) Push(repo, branch, files.ToDictionary(kv => kv.Key, kv => (string?)kv.Value));
        return repo;
    }

    /// <summary>Simulates someone else committing to GitHub: sets (value) or deletes (null) paths on top of the branch head.</summary>
    public string Push(Repo repo, string branch, IDictionary<string, string?> changes)
    {
        var parent = repo.Head(branch);
        var files = parent is null ? new Dictionary<string, string>() : new Dictionary<string, string>(repo.FilesAt(branch));
        foreach (var (path, content) in changes)
        {
            if (content is null) files.Remove(path);
            else files[path] = StoreBlob(repo, Encoding.UTF8.GetBytes(content));
        }
        var commit = MakeCommit(repo, StoreTree(repo, files), parent, "Remote edit", "someone");
        repo.Branches[branch] = commit;
        return commit;
    }

    // ---- internals -------------------------------------------------------------------------------------

    private static string Sha1(string text) => Convert.ToHexString(SHA1.HashData(Encoding.UTF8.GetBytes(text))).ToLowerInvariant();

    private static string StoreBlob(Repo repo, byte[] data)
    {
        var sha = SyncLocal.BlobSha(data);
        repo.Blobs[sha] = data;
        return sha;
    }

    private static string StoreTree(Repo repo, Dictionary<string, string> files)
    {
        var sha = Sha1("tree:" + string.Join("\n", files.OrderBy(kv => kv.Key, StringComparer.Ordinal).Select(kv => kv.Key + ":" + kv.Value)));
        repo.Trees[sha] = new Dictionary<string, string>(files);
        return sha;
    }

    private string MakeCommit(Repo repo, string tree, string? parent, string message, string author)
    {
        var sha = Sha1($"commit:{tree}:{parent}:{message}:{++_counter}");
        repo.Commits[sha] = new Commit(tree, parent, message, author);
        return sha;
    }

    private static bool IsAncestor(Repo repo, string ancestor, string? descendant)
    {
        for (var c = descendant; c is not null; c = repo.Commits[c].Parent)
            if (c == ancestor) return true;
        return false;
    }

    private static HttpResponseMessage Json(HttpStatusCode status, JsonNode body) =>
        new(status) { Content = new StringContent(body.ToJsonString(), Encoding.UTF8, "application/json") };

    private static HttpResponseMessage Error(HttpStatusCode status, string message) =>
        Json(status, new JsonObject { ["message"] = message });

    private static JsonObject RepoJson(Repo r) => new() { ["full_name"] = r.Name, ["default_branch"] = r.DefaultBranch, ["private"] = r.Private };

    protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
    {
        var path = request.RequestUri!.AbsolutePath;
        Requests.Add($"{request.Method} {request.RequestUri.Host}{path}");
        var body = request.Content is null ? null : JsonNode.Parse(await request.Content.ReadAsStringAsync(cancellationToken)) as JsonObject;

        // GitHub's OAuth endpoints live on github.com, not the API host.
        if (request.RequestUri.Host == "github.com")
        {
            if (path == "/login/device/code")
                return Json(HttpStatusCode.OK, new JsonObject { ["device_code"] = "dev123", ["user_code"] = "ABCD-1234", ["verification_uri"] = "https://github.com/login/device", ["interval"] = 5, ["expires_in"] = 900 });
            if (path == "/login/oauth/access_token")
                return Json(HttpStatusCode.OK, TokenResponses.Count > 0 ? TokenResponses.Dequeue() : new JsonObject { ["error"] = "authorization_pending" });
            return Error(HttpStatusCode.NotFound, "Not Found");
        }

        if (request.Headers.Authorization?.Scheme != "Bearer" || string.IsNullOrEmpty(request.Headers.Authorization.Parameter))
            return Error(HttpStatusCode.Unauthorized, "Bad credentials");
        if (!request.Headers.UserAgent.Any()) return Error(HttpStatusCode.Forbidden, "Request forbidden by administrative rules. Please make sure your request has a User-Agent header.");

        if (path == "/user" && request.Method == HttpMethod.Get) return Json(HttpStatusCode.OK, new JsonObject { ["login"] = Login });
        if (path == "/user/repos" && request.Method == HttpMethod.Get) return Json(HttpStatusCode.OK, new JsonArray(Repos.Values.Select(r => (JsonNode?)RepoJson(r)).ToArray()));
        if (path == "/user/repos" && request.Method == HttpMethod.Post)
        {
            var name = $"{Login}/{body!["name"]!.GetValue<string>()}";
            if (Repos.ContainsKey(name)) return Json(HttpStatusCode.UnprocessableEntity, new JsonObject { ["message"] = "Repository creation failed.", ["errors"] = new JsonArray(new JsonObject { ["message"] = "name already exists on this account" }) });
            var repo = AddRepo(name);
            repo.Private = body["private"]!.GetValue<bool>();
            return Json(HttpStatusCode.Created, RepoJson(repo));
        }

        var m = Regex.Match(path, @"^/repos/([^/]+/[^/]+)(?:/(.*))?$");
        if (!m.Success || !Repos.TryGetValue(m.Groups[1].Value, out var r)) return Error(HttpStatusCode.NotFound, "Not Found");
        var rest = m.Groups[2].Value;
        if (rest.Length == 0 && request.Method == HttpMethod.Get) return Json(HttpStatusCode.OK, RepoJson(r));

        var refMatch = Regex.Match(rest, @"^git/ref/heads/(.+)$");
        if (refMatch.Success)
        {
            if (r.Branches.Count == 0) return Error(HttpStatusCode.Conflict, "Git Repository is empty.");
            return r.Head(refMatch.Groups[1].Value) is { } sha
                ? Json(HttpStatusCode.OK, new JsonObject { ["object"] = new JsonObject { ["sha"] = sha } })
                : Error(HttpStatusCode.NotFound, "Not Found");
        }

        var commitMatch = Regex.Match(rest, @"^git/commits/([0-9a-f]+)$");
        if (commitMatch.Success && request.Method == HttpMethod.Get)
            return r.Commits.TryGetValue(commitMatch.Groups[1].Value, out var c)
                ? Json(HttpStatusCode.OK, new JsonObject { ["sha"] = commitMatch.Groups[1].Value, ["tree"] = new JsonObject { ["sha"] = c.Tree } })
                : Error(HttpStatusCode.NotFound, "Not Found");

        var treeMatch = Regex.Match(rest, @"^git/trees/([0-9a-f]+)$");
        if (treeMatch.Success && request.Method == HttpMethod.Get)
        {
            if (!r.Trees.TryGetValue(treeMatch.Groups[1].Value, out var files)) return Error(HttpStatusCode.NotFound, "Not Found");
            var entries = new JsonArray();
            // Real responses include directory entries too; the client must skip them.
            foreach (var dir in files.Keys.Where(p => p.Contains('/')).Select(p => p[..p.LastIndexOf('/')]).Distinct())
                entries.Add(new JsonObject { ["path"] = dir, ["mode"] = "040000", ["type"] = "tree", ["sha"] = Sha1("dir:" + dir) });
            foreach (var (p, sha) in files)
                entries.Add(new JsonObject { ["path"] = p, ["mode"] = "100644", ["type"] = "blob", ["sha"] = sha });
            return Json(HttpStatusCode.OK, new JsonObject { ["tree"] = entries, ["truncated"] = false });
        }

        var blobMatch = Regex.Match(rest, @"^git/blobs/([0-9a-f]+)$");
        if (blobMatch.Success && request.Method == HttpMethod.Get)
        {
            if (!r.Blobs.TryGetValue(blobMatch.Groups[1].Value, out var data)) return Error(HttpStatusCode.NotFound, "Not Found");
            var b64 = Convert.ToBase64String(data);
            var wrapped = string.Join("\n", Enumerable.Range(0, (b64.Length + 59) / 60).Select(i => b64.Substring(i * 60, Math.Min(60, b64.Length - i * 60))));
            return Json(HttpStatusCode.OK, new JsonObject { ["content"] = wrapped, ["encoding"] = "base64" });
        }

        if (rest == "git/blobs" && request.Method == HttpMethod.Post)
            return Json(HttpStatusCode.Created, new JsonObject { ["sha"] = StoreBlob(r, Convert.FromBase64String(body!["content"]!.GetValue<string>())) });

        if (rest == "git/trees" && request.Method == HttpMethod.Post)
        {
            var files = new Dictionary<string, string>(r.Trees[body!["base_tree"]!.GetValue<string>()]);
            foreach (var t in body["tree"]!.AsArray())
            {
                var p = t!["path"]!.GetValue<string>();
                if (t["sha"] is null) { if (!files.Remove(p)) return Error(HttpStatusCode.UnprocessableEntity, $"GitRPC::BadObjectState: path {p} not in base tree"); }
                else files[p] = t["sha"]!.GetValue<string>();
            }
            return Json(HttpStatusCode.Created, new JsonObject { ["sha"] = StoreTree(r, files) });
        }

        if (rest == "git/commits" && request.Method == HttpMethod.Post)
        {
            var parent = body!["parents"]!.AsArray()[0]!.GetValue<string>();
            if (!r.Commits.ContainsKey(parent)) return Error(HttpStatusCode.UnprocessableEntity, "Parent does not exist");
            var sha = MakeCommit(r, body["tree"]!.GetValue<string>(), parent, body["message"]!.GetValue<string>(), body["author"]!["name"]!.GetValue<string>());
            return Json(HttpStatusCode.Created, new JsonObject { ["sha"] = sha });
        }

        var patchMatch = Regex.Match(rest, @"^git/refs/heads/(.+)$");
        if (patchMatch.Success && request.Method == HttpMethod.Patch)
        {
            var branch = patchMatch.Groups[1].Value;
            var target = body!["sha"]!.GetValue<string>();
            if (RejectNextBranchUpdate)
            {
                RejectNextBranchUpdate = false;
                return Error(HttpStatusCode.UnprocessableEntity, "Update is not a fast forward");
            }
            if (r.Head(branch) is not { } current || !IsAncestor(r, current, target))
                return Error(HttpStatusCode.UnprocessableEntity, "Update is not a fast forward");
            r.Branches[branch] = target;
            return Json(HttpStatusCode.OK, new JsonObject { ["ref"] = $"refs/heads/{branch}" });
        }

        var contents = Regex.Match(rest, @"^contents/(.+)$");
        if (contents.Success && request.Method == HttpMethod.Put)
        {
            if (r.Branches.Count > 0) return Error(HttpStatusCode.UnprocessableEntity, "Invalid request. \"sha\" wasn't supplied.");
            var file = Uri.UnescapeDataString(contents.Groups[1].Value);
            var blob = StoreBlob(r, Convert.FromBase64String(body!["content"]!.GetValue<string>()));
            var commit = MakeCommit(r, StoreTree(r, new Dictionary<string, string> { [file] = blob }), null, body["message"]!.GetValue<string>(), body["committer"]!["name"]!.GetValue<string>());
            r.Branches[body["branch"]!.GetValue<string>()] = commit;
            return Json(HttpStatusCode.Created, new JsonObject { ["commit"] = new JsonObject { ["sha"] = commit } });
        }

        return Error(HttpStatusCode.NotFound, $"Not Found: {request.Method} {path}");
    }
}
