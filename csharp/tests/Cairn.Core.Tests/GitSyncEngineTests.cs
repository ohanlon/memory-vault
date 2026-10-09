using System.Text;
using Cairn.Core.Sync;
using Xunit;

namespace Cairn.Core.Tests;

public sealed class GitSyncEngineTests : IDisposable
{
    private const string RepoName = "octo/notes";
    private readonly string _root = Path.Combine(Path.GetTempPath(), "cairn-gitsync-" + Guid.NewGuid().ToString("N"));
    private readonly FakeGithub _github = new();
    private readonly GitSyncEngine _engine;

    public GitSyncEngineTests()
    {
        Directory.CreateDirectory(_root);
        _engine = new GitSyncEngine(new GithubClient(new HttpClient(_github)));
    }

    public void Dispose()
    {
        try { Directory.Delete(_root, recursive: true); } catch (IOException) { }
    }

    private string PathOf(string relative) => Path.Combine(_root, relative);

    private void Write(string relative, string content)
    {
        Directory.CreateDirectory(Path.GetDirectoryName(PathOf(relative))!);
        File.WriteAllText(PathOf(relative), content, new UTF8Encoding(false));
    }

    private string Read(string relative) => File.ReadAllText(PathOf(relative));

    private Task<SyncResult> Sync(string branch = "main", bool pullOnly = false, string[]? paths = null, string? message = null) =>
        _engine.SyncAsync(new SyncOptions(_root, RepoName, branch, "tok", "octo", "octo@users.noreply.github.com", pullOnly, paths, message));

    private List<SyncChange> Changes() => SyncLocal.ListChanges(_root, SyncLocal.ReadState(_root, RepoName, "main"));

    private static string[] Keys(FakeGithub.Repo repo, string branch = "main") =>
        repo.FilesAt(branch).Keys.OrderBy(k => k, StringComparer.Ordinal).ToArray();

    // ---- pushing ---------------------------------------------------------------------------------------

    [Fact]
    public async Task FirstSyncIntoAnEmptyRepositoryPushesEveryFile()
    {
        var repo = _github.AddRepo(RepoName);
        Write("a.md", "alpha\n");
        Write("sub/b.md", "beta\n");

        var result = await Sync();

        Assert.Equal("synced", result.Status);
        Assert.True(result.Committed && result.Pushed);
        Assert.Equal(new[] { ".gitignore", "a.md", "sub/b.md" }, Keys(repo));
        Assert.Equal("alpha\n", repo.TextOf("main", "a.md"));
        // The first file creates the branch through the Contents API; the rest follow as a normal commit.
        Assert.Equal(2, repo.Commits.Count);
        Assert.Equal("octo", repo.Commits[repo.Head("main")!].AuthorName);
    }

    [Fact]
    public async Task ASecondSyncWithNothingNewMakesNoCommit()
    {
        var repo = _github.AddRepo(RepoName);
        Write("a.md", "alpha\n");
        await Sync();
        var commits = repo.Commits.Count;

        var result = await Sync();

        Assert.Equal("Already up to date.", result.Message);
        Assert.False(result.Committed);
        Assert.Equal(commits, repo.Commits.Count);
    }

    [Fact]
    public async Task CommittingEverythingIncludesTheLazyGitignoreSoNothingIsLeftOver()
    {
        var repo = _github.AddRepo(RepoName);
        Write("a.md", "alpha\n");

        await Sync();

        Assert.Contains(".gitignore", Keys(repo));
        Assert.Empty(Changes());
    }

    [Fact]
    public async Task OnlyTheSelectedPathsAreCommitted()
    {
        var repo = _github.AddRepo(RepoName, files: new Dictionary<string, string> { ["seed.md"] = "s" });
        await Sync(pullOnly: true);
        Write("one.md", "1");
        Write("two.md", "2");

        var result = await Sync(paths: new[] { "one.md" }, message: "Just one");

        Assert.True(result.Pushed);
        Assert.Equal(new[] { "one.md", "seed.md" }, Keys(repo));
        Assert.Equal("Just one", repo.Commits[repo.Head("main")!].Message);
        Assert.Contains(Changes(), c => c.Path == "two.md" && c.State == "added");
        Assert.Contains(Changes(), c => c.Path == ".gitignore" && c.State == "added"); // written, but not part of the chosen subset
    }

    [Fact]
    public async Task ALocalDeletionIsPushed()
    {
        var repo = _github.AddRepo(RepoName, files: new Dictionary<string, string> { ["a.md"] = "a", ["b.md"] = "b" });
        await Sync(pullOnly: true);
        File.Delete(PathOf("b.md"));

        var result = await Sync(paths: new[] { "b.md" });

        Assert.True(result.Pushed);
        Assert.Equal(new[] { "a.md" }, Keys(repo));
        Assert.DoesNotContain(Changes(), c => c.Path == "b.md");
    }

    [Fact]
    public async Task AFileIdenticalToGithubsIsRecordedWithoutBeingUploaded()
    {
        var repo = _github.AddRepo(RepoName, files: new Dictionary<string, string> { ["a.md"] = "same\n" });
        Write("a.md", "same\n");
        var commits = repo.Commits.Count;
        _github.Requests.Clear();

        var result = await Sync();

        Assert.False(result.Committed);
        Assert.Equal(commits, repo.Commits.Count);
        Assert.DoesNotContain(_github.Requests, r => r.StartsWith("POST") && r.Contains("/git/blobs"));
        Assert.DoesNotContain(Changes(), c => c.Path == "a.md");
    }

    [Fact]
    public async Task LocalEditsAreCommittedOnTopOfAnUnrelatedRemoteChange()
    {
        var repo = _github.AddRepo(RepoName, files: new Dictionary<string, string> { ["a.md"] = "a", ["c.md"] = "c" });
        await Sync(pullOnly: true);
        Write("a.md", "a edited locally");
        _github.Push(repo, "main", new Dictionary<string, string> { ["c.md"] = "c edited remotely" });

        var result = await Sync();

        Assert.Equal("Synced (pulled, committed, pushed).", result.Message);
        Assert.Equal("c edited remotely", Read("c.md"));
        Assert.Equal("a edited locally", repo.TextOf("main", "a.md"));
        Assert.Equal("c edited remotely", repo.TextOf("main", "c.md"));
    }

    [Fact]
    public async Task ABranchThatMovedDuringThePushIsRefusedAndNothingIsRecorded()
    {
        var repo = _github.AddRepo(RepoName, files: new Dictionary<string, string> { ["a.md"] = "a" });
        await Sync(pullOnly: true);
        var head = repo.Head("main");
        Write("a.md", "edited");
        _github.RejectNextBranchUpdate = true;

        var result = await Sync();

        Assert.Equal("error", result.Status);
        Assert.Contains("GitHub changed while syncing", result.Message);
        Assert.Equal(head, repo.Head("main"));
        Assert.Contains(Changes(), c => c.Path == "a.md" && c.State == "modified");

        // And a retry succeeds.
        Assert.True((await Sync()).Pushed);
    }

    // ---- pulling ---------------------------------------------------------------------------------------

    [Fact]
    public async Task FirstSyncAdoptsTheRemoteFilesIntoAnEmptyFolder()
    {
        _github.AddRepo(RepoName, files: new Dictionary<string, string> { ["a.md"] = "alpha\n", ["notes/b.md"] = "beta\n" });

        var result = await Sync();

        Assert.Equal("Synced (pulled).", result.Message);
        Assert.Equal("alpha\n", Read("a.md"));
        Assert.Equal("beta\n", Read(Path.Combine("notes", "b.md")));
        Assert.Empty(Changes().Where(c => c.Path != ".gitignore"));
    }

    [Fact]
    public async Task FirstSyncRefusesWhenALocalFileDiffersFromTheRemoteOne()
    {
        var repo = _github.AddRepo(RepoName, files: new Dictionary<string, string> { ["a.md"] = "remote\n", ["b.md"] = "b\n" });
        Write("a.md", "local\n");

        var result = await Sync();

        Assert.Equal("conflict", result.Status);
        Assert.Contains("a.md", result.Message);
        Assert.Equal("local\n", Read("a.md"));
        Assert.False(File.Exists(PathOf("b.md")), "a refused pull must leave the folder untouched");
        Assert.Equal("remote\n", repo.TextOf("main", "a.md"));
    }

    [Fact]
    public async Task APullBringsDownGithubsChangesAndKeepsUnrelatedLocalEdits()
    {
        var repo = _github.AddRepo(RepoName, files: new Dictionary<string, string> { ["a.md"] = "a", ["b.md"] = "b" });
        await Sync(pullOnly: true);
        Write("b.md", "b edited locally");
        _github.Push(repo, "main", new Dictionary<string, string> { ["a.md"] = "a edited remotely", ["new.md"] = "n" });

        var result = await Sync(pullOnly: true);

        Assert.Equal("Pulled changes from GitHub.", result.Message);
        Assert.True(result.Pulled);
        Assert.Equal("a edited remotely", Read("a.md"));
        Assert.Equal("n", Read("new.md"));
        Assert.Equal("b edited locally", Read("b.md"));
        Assert.Contains(Changes(), c => c.Path == "b.md" && c.State == "modified");
    }

    [Fact]
    public async Task APullRefusesWhenTheSameFileWasEditedOnBothSides()
    {
        var repo = _github.AddRepo(RepoName, files: new Dictionary<string, string> { ["a.md"] = "a", ["other.md"] = "o" });
        await Sync(pullOnly: true);
        Write("a.md", "a local");
        _github.Push(repo, "main", new Dictionary<string, string> { ["a.md"] = "a remote", ["other.md"] = "o remote" });
        var head = repo.Head("main");

        var result = await Sync();

        Assert.Equal("conflict", result.Status);
        Assert.Contains("a.md", result.Message);
        Assert.Equal("a local", Read("a.md"));
        Assert.Equal("o", Read("other.md"));
        Assert.Equal(head, repo.Head("main"));
    }

    [Fact]
    public async Task AFileGithubDeletedIsRemovedLocally()
    {
        var repo = _github.AddRepo(RepoName, files: new Dictionary<string, string> { ["a.md"] = "a", ["b.md"] = "b" });
        await Sync(pullOnly: true);
        _github.Push(repo, "main", new Dictionary<string, string?> { ["b.md"] = null });

        await Sync(pullOnly: true);

        Assert.False(File.Exists(PathOf("b.md")));
        Assert.True(File.Exists(PathOf("a.md")));
    }

    [Fact]
    public async Task PullOnlyNeverPushesLocalEdits()
    {
        var repo = _github.AddRepo(RepoName, files: new Dictionary<string, string> { ["a.md"] = "a" });
        await Sync(pullOnly: true);
        Write("mine.md", "mine");
        var head = repo.Head("main");

        var result = await Sync(pullOnly: true);

        Assert.Equal("Already up to date.", result.Message);
        Assert.Equal(head, repo.Head("main"));
    }

    [Fact]
    public async Task RemoteFilesThatAreUnsafeIgnoredOrInternalAreNeverWritten()
    {
        _github.AddRepo(RepoName, files: new Dictionary<string, string>
        {
            ["ok.md"] = "ok",
            ["../escape.md"] = "x",
            [".git/config"] = "x",
            [".cairn/state.json"] = "x",
            [".DS_Store"] = "x",
        });

        var result = await Sync();

        Assert.Equal("synced", result.Status);
        Assert.Equal("ok", Read("ok.md"));
        Assert.False(File.Exists(Path.Combine(Path.GetDirectoryName(_root)!, "escape.md")));
        Assert.False(File.Exists(PathOf(".DS_Store")));
        Assert.False(File.Exists(PathOf(Path.Combine(".git", "config"))));
    }

    // ---- errors ----------------------------------------------------------------------------------------

    [Fact]
    public async Task AMissingBranchIsReported()
    {
        _github.AddRepo(RepoName, files: new Dictionary<string, string> { ["a.md"] = "a" });

        var result = await Sync(branch: "dev");

        Assert.Equal("error", result.Status);
        Assert.Contains("\"dev\" doesn't exist", result.Message);
    }

    [Fact]
    public async Task ARepositoryTheTokenCannotSeeIsReportedNotThrown()
    {
        var result = await Sync(); // no such repo registered

        Assert.Equal("error", result.Status);
        Assert.Contains("was not found, or your GitHub account can't access it", result.Message);
    }

    [Fact]
    public async Task ChangingTheLinkedBranchStartsFromAFreshSnapshot()
    {
        var repo = _github.AddRepo(RepoName, files: new Dictionary<string, string> { ["a.md"] = "a" });
        await Sync(pullOnly: true);
        _github.Push(repo, "dev", new Dictionary<string, string> { ["a.md"] = "a on dev" });

        var result = await Sync(branch: "dev");

        Assert.Equal("conflict", result.Status); // the local a.md matches main, not dev, and no snapshot says otherwise
        Assert.Equal("a", Read("a.md"));
    }
}
