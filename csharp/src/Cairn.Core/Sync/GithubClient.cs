using System.Net;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json.Nodes;

namespace Cairn.Core.Sync;

/// <summary>An error from GitHub, carrying the HTTP status so callers can branch on 404/409/422.</summary>
public sealed class GithubApiException(HttpStatusCode status, string message) : Exception(message)
{
    public HttpStatusCode Status { get; } = status;
}

public sealed record GithubRepo(string FullName, string DefaultBranch, bool Private);

public sealed record TreeEntry(string Path, string Mode, string Type, string Sha);

/// <summary>A new or deleted (Sha == null) file in a commit being built.</summary>
public sealed record TreeChange(string Path, string? Sha);

public enum RefState { Found, EmptyRepository, MissingBranch }

public sealed record RefLookup(RefState State, string? CommitSha);

/// <summary>
/// The slice of GitHub's REST API the sync uses (port of electron/githubApi.ts, plus the Git Data API that stands in
/// for isomorphic-git). Needs no git binary or native library, so it runs the same on every host.
/// </summary>
public sealed class GithubClient(HttpClient http)
{
    private const string Api = "https://api.github.com";

    private async Task<JsonNode?> SendAsync(string token, HttpMethod method, string path, JsonNode? body = null)
    {
        using var request = new HttpRequestMessage(method, Api + path);
        request.Headers.Accept.ParseAdd("application/vnd.github+json");
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", token);
        request.Headers.Add("X-GitHub-Api-Version", "2022-11-28");
        request.Headers.UserAgent.ParseAdd("Cairn"); // GitHub rejects requests without a User-Agent
        if (body is not null) request.Content = new StringContent(body.ToJsonString(), Encoding.UTF8, "application/json");

        using var response = await http.SendAsync(request);
        var text = await response.Content.ReadAsStringAsync();
        JsonNode? json = null;
        try { json = text.Length == 0 ? null : JsonNode.Parse(text); } catch (System.Text.Json.JsonException) { }

        if (response.StatusCode == HttpStatusCode.Unauthorized)
            throw new GithubApiException(response.StatusCode, "GitHub rejected the saved sign-in. Reconnect GitHub in Settings.");
        if (!response.IsSuccessStatusCode)
        {
            var message = json?["message"]?.GetValue<string>() ?? $"GitHub returned {(int)response.StatusCode}";
            var errors = json?["errors"] is JsonArray arr
                ? string.Join("; ", arr.Select(e => e?["message"]?.GetValue<string>()).Where(m => m is not null))
                : "";
            throw new GithubApiException(response.StatusCode, errors.Length > 0 ? $"{message} ({errors})" : message);
        }
        return json;
    }

    private static GithubRepo ToRepo(JsonNode? r) => new(
        r?["full_name"]?.GetValue<string>() ?? "",
        r?["default_branch"]?.GetValue<string>() ?? "main",
        r?["private"]?.GetValue<bool>() ?? false);

    public async Task<string> GetUserLoginAsync(string token) =>
        (await SendAsync(token, HttpMethod.Get, "/user"))?["login"]?.GetValue<string>() ?? throw new InvalidOperationException("GitHub returned no user");

    public async Task<List<GithubRepo>> ListReposAsync(string token)
    {
        var json = await SendAsync(token, HttpMethod.Get, "/user/repos?per_page=100&sort=updated&affiliation=owner,collaborator");
        return (json as JsonArray)?.Select(ToRepo).ToList() ?? new List<GithubRepo>();
    }

    public async Task<GithubRepo> CreateRepoAsync(string token, string name, bool isPrivate) =>
        ToRepo(await SendAsync(token, HttpMethod.Post, "/user/repos", new JsonObject
        {
            ["name"] = name,
            ["private"] = isPrivate,
            ["description"] = "Notes synced from Cairn",
        }));

    // ---- Git Data API ---------------------------------------------------------------------------------

    /// <summary>The commit a branch points at. An empty repository (no commits at all) can't use the Git Data API yet.</summary>
    public async Task<RefLookup> GetBranchHeadAsync(string token, string repo, string branch)
    {
        try
        {
            var json = await SendAsync(token, HttpMethod.Get, $"/repos/{repo}/git/ref/heads/{branch}");
            return new RefLookup(RefState.Found, json?["object"]?["sha"]?.GetValue<string>());
        }
        catch (GithubApiException e) when (e.Status == HttpStatusCode.Conflict) // "Git Repository is empty."
        {
            return new RefLookup(RefState.EmptyRepository, null);
        }
        catch (GithubApiException e) when (e.Status == HttpStatusCode.NotFound)
        {
            // GitHub answers 404 for a missing branch and for a repository that doesn't exist (or that this token
            // can't see), so tell them apart before blaming the branch.
            try
            {
                await SendAsync(token, HttpMethod.Get, $"/repos/{repo}");
            }
            catch (GithubApiException repoError) when (repoError.Status == HttpStatusCode.NotFound)
            {
                throw new GithubApiException(HttpStatusCode.NotFound, $"Repository {repo} was not found, or your GitHub account can't access it.");
            }
            return new RefLookup(RefState.MissingBranch, null);
        }
    }

    public async Task<string> GetCommitTreeShaAsync(string token, string repo, string commitSha) =>
        (await SendAsync(token, HttpMethod.Get, $"/repos/{repo}/git/commits/{commitSha}"))?["tree"]?["sha"]?.GetValue<string>()
        ?? throw new InvalidOperationException("GitHub returned a commit with no tree");

    public async Task<List<TreeEntry>> GetTreeAsync(string token, string repo, string treeSha)
    {
        var json = await SendAsync(token, HttpMethod.Get, $"/repos/{repo}/git/trees/{treeSha}?recursive=1");
        if (json?["truncated"]?.GetValue<bool>() == true)
            throw new InvalidOperationException("This repository is too large to sync through GitHub's API.");
        return (json?["tree"] as JsonArray ?? new JsonArray())
            .Select(t => new TreeEntry(
                t!["path"]!.GetValue<string>(), t["mode"]!.GetValue<string>(), t["type"]!.GetValue<string>(), t["sha"]!.GetValue<string>()))
            .ToList();
    }

    public async Task<byte[]> GetBlobAsync(string token, string repo, string sha)
    {
        var json = await SendAsync(token, HttpMethod.Get, $"/repos/{repo}/git/blobs/{sha}");
        var content = json?["content"]?.GetValue<string>() ?? "";
        return Convert.FromBase64String(content.Replace("\n", "").Replace("\r", ""));
    }

    public async Task<string> CreateBlobAsync(string token, string repo, byte[] content) =>
        (await SendAsync(token, HttpMethod.Post, $"/repos/{repo}/git/blobs", new JsonObject
        {
            ["content"] = Convert.ToBase64String(content),
            ["encoding"] = "base64",
        }))?["sha"]?.GetValue<string>() ?? throw new InvalidOperationException("GitHub returned no blob sha");

    public async Task<string> CreateTreeAsync(string token, string repo, string baseTreeSha, IEnumerable<TreeChange> changes)
    {
        var tree = new JsonArray();
        foreach (var c in changes)
            tree.Add(new JsonObject { ["path"] = c.Path, ["mode"] = "100644", ["type"] = "blob", ["sha"] = c.Sha });
        return (await SendAsync(token, HttpMethod.Post, $"/repos/{repo}/git/trees", new JsonObject
        {
            ["base_tree"] = baseTreeSha,
            ["tree"] = tree,
        }))?["sha"]?.GetValue<string>() ?? throw new InvalidOperationException("GitHub returned no tree sha");
    }

    public async Task<string> CreateCommitAsync(string token, string repo, string message, string treeSha, string parentSha, string authorName, string authorEmail) =>
        (await SendAsync(token, HttpMethod.Post, $"/repos/{repo}/git/commits", new JsonObject
        {
            ["message"] = message,
            ["tree"] = treeSha,
            ["parents"] = new JsonArray(parentSha),
            ["author"] = new JsonObject
            {
                ["name"] = authorName,
                ["email"] = authorEmail,
                ["date"] = DateTimeOffset.UtcNow.ToString("yyyy-MM-dd'T'HH:mm:ss'Z'"),
            },
        }))?["sha"]?.GetValue<string>() ?? throw new InvalidOperationException("GitHub returned no commit sha");

    /// <summary>Moves the branch to <paramref name="commitSha"/> without force, so a branch that moved meanwhile is refused.</summary>
    public async Task UpdateBranchAsync(string token, string repo, string branch, string commitSha) =>
        await SendAsync(token, HttpMethod.Patch, $"/repos/{repo}/git/refs/heads/{branch}", new JsonObject
        {
            ["sha"] = commitSha,
            ["force"] = false,
        });

    /// <summary>
    /// Creates a file through the Contents API, which (unlike the Git Data API) works on a repository with no commits yet
    /// and creates the first commit and the branch. Returns that commit's sha.
    /// </summary>
    public async Task<string> CreateFirstCommitAsync(string token, string repo, string branch, string path, byte[] content, string message, string authorName, string authorEmail) =>
        (await SendAsync(token, HttpMethod.Put, $"/repos/{repo}/contents/{path}", new JsonObject
        {
            ["message"] = message,
            ["content"] = Convert.ToBase64String(content),
            ["branch"] = branch,
            ["committer"] = new JsonObject { ["name"] = authorName, ["email"] = authorEmail },
        }))?["commit"]?["sha"]?.GetValue<string>() ?? throw new InvalidOperationException("GitHub returned no commit sha");
}
