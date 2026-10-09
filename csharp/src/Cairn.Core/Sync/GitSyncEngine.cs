using System.Net;

namespace Cairn.Core.Sync;

public sealed record SyncResult(string Status, string Message, bool Committed, bool Pushed, bool Pulled);

public sealed record SyncOptions(
    string Root,
    string RepoFullName,
    string Branch,
    string Token,
    string AuthorName,
    string AuthorEmail,
    /// <summary>Only bring GitHub's changes down: never commit local edits or push.</summary>
    bool PullOnly = false,
    /// <summary>Commit only these (already validated) paths instead of every change.</summary>
    IReadOnlyList<string>? Paths = null,
    string? Message = null);

/// <summary>What bringing GitHub's changes into the folder would do. Pure data so every branch is testable offline.</summary>
public sealed record PullPlan(
    List<(string Path, string Sha)> Download,
    List<string> Delete,
    /// <summary>Already identical locally: only the snapshot needs updating.</summary>
    List<(string Path, string? Sha)> Adopt,
    List<string> Conflicts);

public static class SyncPlanner
{
    /// <summary>
    /// Three-way comparison of the last-synced snapshot (<paramref name="snapshot"/>), the folder now
    /// (<paramref name="local"/>) and GitHub now (<paramref name="remote"/>). A remote change is applied only when the
    /// local copy still matches the snapshot; if both sides changed the same file differently it is a conflict, and
    /// the caller applies nothing. Like electron/gitSync.ts, it never overwrites either side.
    /// </summary>
    public static PullPlan PlanPull(
        IReadOnlyDictionary<string, string> snapshot,
        IReadOnlyDictionary<string, string> local,
        IReadOnlyDictionary<string, string> remote)
    {
        var plan = new PullPlan(new(), new(), new(), new());
        foreach (var path in snapshot.Keys.Union(remote.Keys).OrderBy(p => p, StringComparer.Ordinal))
        {
            snapshot.TryGetValue(path, out var baseSha);
            remote.TryGetValue(path, out var remoteSha);
            if (remoteSha == baseSha) continue; // GitHub didn't touch it

            local.TryGetValue(path, out var localSha);
            if (localSha == remoteSha) plan.Adopt.Add((path, remoteSha));
            else if (localSha == baseSha)
            {
                if (remoteSha is null) plan.Delete.Add(path);
                else plan.Download.Add((path, remoteSha));
            }
            else plan.Conflicts.Add(path);
        }
        return plan;
    }
}

/// <summary>
/// Syncs a notes folder with a GitHub branch through the REST API: pull (fast-forward the folder to GitHub, refusing
/// anything that would overwrite local edits), then commit the chosen local changes as one commit on top of GitHub's
/// head. The C# stand-in for electron/gitSync.ts, which uses isomorphic-git and a local .git folder.
/// </summary>
public sealed class GitSyncEngine(GithubClient github)
{
    public async Task<SyncResult> SyncAsync(SyncOptions o)
    {
        bool pulled = false, committed = false, pushed = false;
        try
        {
            var state = SyncLocal.ReadState(o.Root, o.RepoFullName, o.Branch) ?? new SyncState(o.RepoFullName, o.Branch);
            var lookup = await github.GetBranchHeadAsync(o.Token, o.RepoFullName, o.Branch);
            if (lookup.State == RefState.MissingBranch)
                throw new InvalidOperationException($"The branch \"{o.Branch}\" doesn't exist in {o.RepoFullName}.");

            var remoteHead = lookup.CommitSha;
            string? remoteTreeSha = null;
            Dictionary<string, string>? remoteFiles = null;
            var ignored = SyncLocal.LoadIgnore(o.Root);

            // ---- pull -------------------------------------------------------------------------------------
            if (remoteHead is not null && remoteHead != state.Head)
            {
                (remoteTreeSha, remoteFiles) = await ReadRemoteAsync(o, remoteHead, ignored);
                var plan = SyncPlanner.PlanPull(state.Files, SyncLocal.Scan(o.Root), remoteFiles);
                if (plan.Conflicts.Count > 0)
                {
                    return new SyncResult("conflict",
                        $"GitHub changed files you have edited locally: {string.Join(", ", plan.Conflicts)}. Nothing was changed.",
                        false, false, false);
                }

                // Fetch everything first so a failed download leaves the folder untouched.
                var downloaded = new List<(string Path, byte[] Data)>();
                foreach (var (path, sha) in plan.Download)
                    downloaded.Add((path, await github.GetBlobAsync(o.Token, o.RepoFullName, sha)));
                foreach (var (path, data) in downloaded) WriteFile(o.Root, path, data);
                foreach (var path in plan.Delete) File.Delete(Path.Combine(o.Root, path));

                foreach (var (path, sha) in plan.Download) state.Files[path] = sha;
                foreach (var path in plan.Delete) state.Files.Remove(path);
                foreach (var (path, sha) in plan.Adopt)
                {
                    if (sha is null) state.Files.Remove(path);
                    else state.Files[path] = sha;
                }
                state.Head = remoteHead;
                SyncLocal.WriteState(o.Root, state);
                pulled = plan.Download.Count + plan.Delete.Count > 0;
            }

            if (o.PullOnly)
                return new SyncResult("synced", pulled ? "Pulled changes from GitHub." : "Already up to date.", false, false, pulled);

            // ---- commit and push ----------------------------------------------------------------------------
            var local = SyncLocal.Scan(o.Root);
            var changes = SyncLocal.ListChanges(o.Root, state, local);

            // Written lazily so adopting a remote that has its own .gitignore doesn't collide with ours. Like
            // electron/gitSync.ts, committing everything includes it; committing a chosen subset leaves it as a change.
            var gitignore = Path.Combine(o.Root, ".gitignore");
            if (changes.Count > 0 && !File.Exists(gitignore))
            {
                File.WriteAllText(gitignore, SyncLocal.DefaultIgnore);
                if (o.Paths is null)
                {
                    local = SyncLocal.Scan(o.Root);
                    changes = SyncLocal.ListChanges(o.Root, state, local);
                }
            }

            var wanted = o.Paths is null ? changes.Select(c => c.Path).ToHashSet() : o.Paths.ToHashSet();
            var selected = changes.Where(c => wanted.Contains(c.Path)).ToList();

            if (selected.Count > 0)
            {
                if (remoteHead is not null && remoteFiles is null)
                    (remoteTreeSha, remoteFiles) = await ReadRemoteAsync(o, remoteHead, ignored);

                (committed, remoteHead, remoteTreeSha, remoteFiles) =
                    await CommitAsync(o, state, selected, local, remoteHead, remoteTreeSha, remoteFiles);
                pushed = committed;
            }

            var parts = new[] { pulled ? "pulled" : null, committed ? "committed" : null, pushed ? "pushed" : null }.Where(p => p is not null);
            return new SyncResult("synced", parts.Any() ? $"Synced ({string.Join(", ", parts)})." : "Already up to date.", committed, pushed, pulled);
        }
        catch (Exception e) when (e is not OperationCanceledException)
        {
            return new SyncResult("error", e.Message, committed, pushed, pulled);
        }
    }

    private async Task<(string TreeSha, Dictionary<string, string> Files)> ReadRemoteAsync(SyncOptions o, string commitSha, Func<string, bool> ignored)
    {
        var treeSha = await github.GetCommitTreeShaAsync(o.Token, o.RepoFullName, commitSha);
        var files = new Dictionary<string, string>(StringComparer.Ordinal);
        foreach (var entry in await github.GetTreeAsync(o.Token, o.RepoFullName, treeSha))
        {
            // Plain files only; submodules, symlinks and anything unsafe or ignored here are left alone.
            if (entry.Type != "blob" || entry.Mode is not ("100644" or "100755")) continue;
            if (!SyncLocal.IsSafeRelativePath(entry.Path) || SyncLocal.IsInternalPath(entry.Path) || ignored(entry.Path)) continue;
            files[entry.Path] = entry.Sha;
        }
        return (treeSha, files);
    }

    private async Task<(bool Committed, string? Head, string? TreeSha, Dictionary<string, string>? Files)> CommitAsync(
        SyncOptions o, SyncState state, List<SyncChange> selected, Dictionary<string, string> local,
        string? remoteHead, string? remoteTreeSha, Dictionary<string, string>? remoteFiles)
    {
        var message = string.IsNullOrWhiteSpace(o.Message)
            ? $"Cairn sync: {selected.Count} file{(selected.Count == 1 ? "" : "s")} changed"
            : o.Message.Trim();

        var pending = selected.ToList();
        var committed = false;

        // An empty repository has no commit to build on, and the Git Data API refuses it: the first file goes through
        // the Contents API, which creates the first commit and the branch.
        if (remoteHead is null)
        {
            var first = pending.FirstOrDefault(c => c.State != "deleted");
            if (first is null) return (false, null, null, null);
            var data = File.ReadAllBytes(Path.Combine(o.Root, first.Path));
            remoteHead = await github.CreateFirstCommitAsync(o.Token, o.RepoFullName, o.Branch, first.Path, data, message, o.AuthorName, o.AuthorEmail);
            remoteTreeSha = await github.GetCommitTreeShaAsync(o.Token, o.RepoFullName, remoteHead);
            remoteFiles = new Dictionary<string, string>(StringComparer.Ordinal) { [first.Path] = SyncLocal.BlobSha(data) };
            state.Head = remoteHead;
            state.Files[first.Path] = remoteFiles[first.Path];
            SyncLocal.WriteState(o.Root, state);
            pending.Remove(first);
            committed = true;
        }

        var changes = new List<TreeChange>();
        var applied = new List<(string Path, string? Sha)>();
        foreach (var change in pending)
        {
            if (change.State == "deleted")
            {
                if (remoteFiles!.ContainsKey(change.Path)) changes.Add(new TreeChange(change.Path, null));
                applied.Add((change.Path, null)); // already gone from GitHub counts as synced
                continue;
            }
            var sha = local[change.Path];
            if (!remoteFiles!.TryGetValue(change.Path, out var onGithub) || onGithub != sha)
            {
                var uploaded = await github.CreateBlobAsync(o.Token, o.RepoFullName, File.ReadAllBytes(Path.Combine(o.Root, change.Path)));
                changes.Add(new TreeChange(change.Path, uploaded));
            }
            applied.Add((change.Path, sha));
        }

        if (changes.Count > 0)
        {
            var tree = await github.CreateTreeAsync(o.Token, o.RepoFullName, remoteTreeSha!, changes);
            var commit = await github.CreateCommitAsync(o.Token, o.RepoFullName, message, tree, remoteHead!, o.AuthorName, o.AuthorEmail);
            try
            {
                await github.UpdateBranchAsync(o.Token, o.RepoFullName, o.Branch, commit);
            }
            catch (GithubApiException e) when (e.Status == HttpStatusCode.UnprocessableEntity)
            {
                // Not a fast-forward: GitHub's branch moved since we read it. The commit we made is simply unreferenced.
                throw new InvalidOperationException("GitHub changed while syncing. Nothing was lost; try again.");
            }
            remoteHead = commit;
            remoteTreeSha = tree;
            committed = true;
        }

        // Record what now matches GitHub, including files that already did.
        foreach (var (path, sha) in applied)
        {
            if (sha is null) state.Files.Remove(path);
            else state.Files[path] = sha;
        }
        state.Head = remoteHead;
        SyncLocal.WriteState(o.Root, state);
        return (committed, remoteHead, remoteTreeSha, remoteFiles);
    }

    private static void WriteFile(string root, string relative, byte[] data)
    {
        var full = Path.GetFullPath(Path.Combine(root, relative));
        if (!full.StartsWith(Path.GetFullPath(root) + Path.DirectorySeparatorChar, StringComparison.Ordinal))
            throw new InvalidOperationException($"Refusing to write outside the notes folder: {relative}");
        Directory.CreateDirectory(Path.GetDirectoryName(full)!);
        File.WriteAllBytes(full, data);
    }
}
