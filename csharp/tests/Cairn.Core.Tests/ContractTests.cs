using System.Text.Json.Nodes;
using System.Text.RegularExpressions;
using Cairn.Core.App;
using Cairn.Core.Storage;
using Xunit;

namespace Cairn.Core.Tests;

/// <summary>Guards against the C# port drifting from the Electron preload's API surface.</summary>
public class ContractTests
{
    private static string? FindRepoFile(string relative)
    {
        for (var dir = new DirectoryInfo(AppContext.BaseDirectory); dir is not null; dir = dir.Parent)
        {
            var candidate = Path.Combine(dir.FullName, relative);
            if (File.Exists(candidate)) return candidate;
        }
        return null;
    }

    private static (HashSet<string> Invokes, HashSet<string> Events) PreloadChannels()
    {
        var preload = FindRepoFile(Path.Combine("electron", "preload.ts"));
        Assert.NotNull(preload);
        var text = File.ReadAllText(preload!);
        var invokes = Regex.Matches(text, @"ipcRenderer\.invoke\(\s*""([^""]+)""").Select(m => m.Groups[1].Value).ToHashSet();
        var events = Regex.Matches(text, @"ipcRenderer\.on\(\s*""([^""]+)""").Select(m => m.Groups[1].Value).ToHashSet();
        return (invokes, events);
    }

    private sealed class NullPlatform : IPlatformServices
    {
        public string BundledPluginsDir => "";
        public Task<string?> PickFolderAsync() => Task.FromResult<string?>(null);
        public Task OpenExternalAsync(string url) => Task.CompletedTask;
        public void ShowItemInFolder(string absPath) { }
        public Task<bool> SaveTextFileAsync(string d, string c, IReadOnlyList<SaveDialogFilter> f) => Task.FromResult(false);
        public Task<bool> SavePdfFromHtmlAsync(string d, string h) => Task.FromResult(false);
        public Task<bool> ConfirmPluginPermissionAsync(string p, string m, string d) => Task.FromResult(false);
        public void SetTitleBarOverlay(string c, string s) { }
        public Task ShowSystemMenuAsync(double x, double y) => Task.CompletedTask;
        public Task<bool> WindowActionAsync(string action) => Task.FromResult(false);
    }

    [Fact]
    public void EveryPreloadInvokeChannelHasAHandler()
    {
        var (invokes, _) = PreloadChannels();
        using var router = new IpcRouter(new CairnPaths(Path.GetTempPath()), new NullPlatform(), (_, _) => { });
        var missing = invokes.Where(c => !router.Has(c)).ToList();
        Assert.True(missing.Count == 0, "No C# handler for: " + string.Join(", ", missing));
    }

    [Fact]
    public void BridgeScriptExposesEveryPreloadChannel()
    {
        var (invokes, events) = PreloadChannels();
        var bridge = FindRepoFile(Path.Combine("csharp", "src", "Cairn.Host", "Web", "bridge.js"));
        Assert.NotNull(bridge);
        var text = File.ReadAllText(bridge!);
        var missing = invokes.Concat(events).Where(c => !text.Contains($"\"{c}\"")).ToList();
        Assert.True(missing.Count == 0, "bridge.js lacks: " + string.Join(", ", missing));
    }
}
