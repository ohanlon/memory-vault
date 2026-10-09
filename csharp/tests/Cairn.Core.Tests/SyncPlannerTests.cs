using Cairn.Core.Sync;
using Xunit;

namespace Cairn.Core.Tests;

public class SyncPlannerTests
{
    private static Dictionary<string, string> D(params (string Path, string Sha)[] items) =>
        items.ToDictionary(i => i.Path, i => i.Sha);

    [Fact]
    public void NothingToDoWhenGithubIsUnchanged()
    {
        var plan = SyncPlanner.PlanPull(D(("a", "1")), D(("a", "2")), D(("a", "1"))); // local edit, remote untouched

        Assert.Empty(plan.Download);
        Assert.Empty(plan.Delete);
        Assert.Empty(plan.Adopt);
        Assert.Empty(plan.Conflicts);
    }

    [Fact]
    public void DownloadsAFileGithubChangedWhenLocalIsUntouched()
    {
        var plan = SyncPlanner.PlanPull(D(("a", "1")), D(("a", "1")), D(("a", "2")));

        Assert.Equal(new[] { ("a", "2") }, plan.Download);
        Assert.Empty(plan.Conflicts);
    }

    [Fact]
    public void DownloadsANewRemoteFile()
    {
        var plan = SyncPlanner.PlanPull(D(), D(), D(("new", "9")));

        Assert.Equal(new[] { ("new", "9") }, plan.Download);
    }

    [Fact]
    public void DeletesALocalFileGithubRemovedWhenLocalIsUntouched()
    {
        var plan = SyncPlanner.PlanPull(D(("a", "1")), D(("a", "1")), D());

        Assert.Equal(new[] { "a" }, plan.Delete);
    }

    [Fact]
    public void BothSidesEditingTheSameFileDifferentlyIsAConflict()
    {
        var plan = SyncPlanner.PlanPull(D(("a", "1")), D(("a", "2")), D(("a", "3")));

        Assert.Equal(new[] { "a" }, plan.Conflicts);
        Assert.Empty(plan.Download);
    }

    [Fact]
    public void LocalEditToAFileGithubDeletedIsAConflict()
    {
        var plan = SyncPlanner.PlanPull(D(("a", "1")), D(("a", "2")), D());

        Assert.Equal(new[] { "a" }, plan.Conflicts);
        Assert.Empty(plan.Delete);
    }

    [Fact]
    public void BothSidesMakingTheSameChangeJustUpdatesTheSnapshot()
    {
        var plan = SyncPlanner.PlanPull(D(("a", "1")), D(("a", "2")), D(("a", "2")));

        Assert.Equal(new (string, string?)[] { ("a", "2") }, plan.Adopt);
        Assert.Empty(plan.Download);
        Assert.Empty(plan.Conflicts);
    }

    [Fact]
    public void BothSidesDeletingAFileJustUpdatesTheSnapshot()
    {
        var plan = SyncPlanner.PlanPull(D(("a", "1")), D(), D());

        Assert.Equal(new (string, string?)[] { ("a", null) }, plan.Adopt);
    }

    [Fact]
    public void FirstSyncAdoptsIdenticalFilesDownloadsMissingOnesAndFlagsDifferingOnes()
    {
        var plan = SyncPlanner.PlanPull(
            D(),
            D(("same", "1"), ("differs", "2"), ("local-only", "3")),
            D(("same", "1"), ("differs", "9"), ("remote-only", "4")));

        Assert.Equal(new (string, string?)[] { ("same", "1") }, plan.Adopt);
        Assert.Equal(new[] { ("remote-only", "4") }, plan.Download);
        Assert.Equal(new[] { "differs" }, plan.Conflicts);
    }

    [Fact]
    public void FilesOnlyEditedLocallyAreLeftAlone()
    {
        var plan = SyncPlanner.PlanPull(D(("a", "1"), ("b", "1")), D(("a", "1"), ("b", "5")), D(("a", "2"), ("b", "1")));

        Assert.Equal(new[] { ("a", "2") }, plan.Download);
        Assert.Empty(plan.Conflicts);
    }
}
