using System.Text;
using Cairn.Core.Sync;
using Xunit;

namespace Cairn.Core.Tests;

public sealed class SyncLocalTests : IDisposable
{
    private readonly string _root = Path.Combine(Path.GetTempPath(), "cairn-synclocal-" + Guid.NewGuid().ToString("N"));

    public SyncLocalTests() => Directory.CreateDirectory(_root);

    public void Dispose()
    {
        try { Directory.Delete(_root, recursive: true); } catch (IOException) { }
    }

    private void Write(string relative, string content)
    {
        var full = Path.Combine(_root, relative);
        Directory.CreateDirectory(Path.GetDirectoryName(full)!);
        File.WriteAllText(full, content, new UTF8Encoding(false));
    }

    // Expected values come from running `git hash-object --stdin` itself, so this checks against git, not against us.
    [Theory]
    [InlineData("", "e69de29bb2d1d6434b8b29ae775ad8c2e48c5391")]
    [InlineData("hello\n", "ce013625030ba8dba906f756967f9e9ca394464a")]
    [InlineData("# Title\n\nCafé ☕\n", "d6a6ab898b653f76ae189494fc2c6f138deef87a")]
    [InlineData("a\r\nb\r\n", "c30dea8a3641ea99b125d04d599d843712292759")]
    public void BlobShaMatchesGitHashObject(string content, string expected) =>
        Assert.Equal(expected, SyncLocal.BlobSha(new UTF8Encoding(false).GetBytes(content)));

    [Theory]
    [InlineData("a.md", true)]
    [InlineData("dir/sub/a.md", true)]
    [InlineData("../evil.md", false)]
    [InlineData("a/../b.md", false)]
    [InlineData("/abs.md", false)]
    [InlineData("a\\b.md", false)]
    [InlineData(".git/config", false)]
    [InlineData("x/.GIT/hooks", false)]
    [InlineData("", false)]
    [InlineData("a//b.md", false)]
    public void SafeRelativePaths(string path, bool safe) => Assert.Equal(safe, SyncLocal.IsSafeRelativePath(path));

    [Fact]
    public void DefaultIgnoresAlwaysApply()
    {
        var ignored = SyncLocal.LoadIgnore(_root);
        Assert.True(ignored(".DS_Store"));
        Assert.True(ignored("sub/.DS_Store"));
        Assert.True(ignored("Thumbs.db"));
        Assert.True(ignored(".cairn/cache.json"));
        Assert.False(ignored("note.md"));
    }

    [Fact]
    public void GitignoreSubsetIsHonoured()
    {
        Write(".gitignore", "# comment\n\n*.tmp\ndrafts/\nbuild/out\n!keep.tmp\n");
        var ignored = SyncLocal.LoadIgnore(_root);

        Assert.True(ignored("scratch.tmp"));
        Assert.True(ignored("a/b/scratch.tmp"));
        Assert.True(ignored("drafts/x.md"));
        Assert.True(ignored("a/drafts/x.md"));
        Assert.False(ignored("drafts"), "a directory pattern must not match a plain file of that name");
        Assert.True(ignored("build/out/log.txt"));
        Assert.False(ignored("other/build/out"), "a pattern with a slash is anchored at the root");
        Assert.True(ignored("keep.tmp"), "negation is not supported, so the earlier *.tmp still wins");
        Assert.False(ignored("note.md"));
    }

    [Fact]
    public void ScanListsSyncableFilesWithForwardSlashes()
    {
        Write("a.md", "hello\n");
        Write("sub/dir/b.md", "x");
        Write(".cairn/cache.json", "{}");
        Write(".git/config", "x");
        Write("trash.tmp", "x");
        Write(".gitignore", "*.tmp\n");

        var files = SyncLocal.Scan(_root);

        Assert.Equal(new[] { ".gitignore", "a.md", "sub/dir/b.md" }, files.Keys.OrderBy(k => k, StringComparer.Ordinal));
        Assert.Equal("ce013625030ba8dba906f756967f9e9ca394464a", files["a.md"]);
    }

    [Fact]
    public void ScanNoticesAnEditEvenWhenTheSizeIsUnchanged()
    {
        Write("a.md", "aaaa");
        var before = SyncLocal.Scan(_root)["a.md"];

        Write("a.md", "bbbb");
        File.SetLastWriteTimeUtc(Path.Combine(_root, "a.md"), DateTime.UtcNow.AddMinutes(1));

        Assert.NotEqual(before, SyncLocal.Scan(_root)["a.md"]);
    }

    [Fact]
    public void ListChangesComparesAgainstTheLastSync()
    {
        Write("same.md", "1");
        Write("edited.md", "2");
        Write("new.md", "3");
        var state = new SyncState("o/r", "main");
        state.Files["same.md"] = SyncLocal.BlobSha(Encoding.UTF8.GetBytes("1"));
        state.Files["edited.md"] = SyncLocal.BlobSha(Encoding.UTF8.GetBytes("old"));
        state.Files["gone.md"] = SyncLocal.BlobSha(Encoding.UTF8.GetBytes("x"));

        var changes = SyncLocal.ListChanges(_root, state);

        Assert.Equal(
            new[] { ("edited.md", "modified"), ("gone.md", "deleted"), ("new.md", "added") },
            changes.Select(c => (c.Path, c.State)));
    }

    [Fact]
    public void EverythingIsAddedBeforeTheFirstSync()
    {
        Write("a.md", "1");
        Write("b/c.md", "2");

        Assert.Equal(new[] { "a.md", "b/c.md" }, SyncLocal.ListChanges(_root, null).Select(c => c.Path));
    }

    [Fact]
    public void ASnapshotEntryThatIsNowIgnoredIsNotReportedAsDeleted()
    {
        Write(".gitignore", "*.tmp\n");
        var state = new SyncState("o/r", "main");
        state.Files["scratch.tmp"] = "abc";

        Assert.DoesNotContain(SyncLocal.ListChanges(_root, state), c => c.Path == "scratch.tmp");
    }

    [Fact]
    public void StateRoundTripsAndIsScopedToTheRepoAndBranch()
    {
        var state = new SyncState("o/r", "main") { Head = "abc123" };
        state.Files["a.md"] = "sha1";
        state.Files["b/c.md"] = "sha2";
        SyncLocal.WriteState(_root, state);

        var read = SyncLocal.ReadState(_root, "o/r", "main")!;
        Assert.Equal("abc123", read.Head);
        Assert.Equal(state.Files, read.Files);

        Assert.Null(SyncLocal.ReadState(_root, "o/other", "main"));
        Assert.Null(SyncLocal.ReadState(_root, "o/r", "dev"));
    }

    [Fact]
    public void CorruptStateReadsAsNone()
    {
        Write(".cairn/sync-state.json", "{not json");
        Assert.Null(SyncLocal.ReadState(_root, "o/r", "main"));
    }
}
