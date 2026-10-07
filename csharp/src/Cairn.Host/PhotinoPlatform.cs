using System.Diagnostics;
using Cairn.Core.App;
using Cairn.Core.Storage;
using Photino.NET;

namespace Cairn.Host;

/// <summary>The Electron <c>dialog</c>/<c>shell</c>/<c>BrowserWindow</c> calls of electron/main.ts, done through the native window and the OS.</summary>
internal sealed class PhotinoPlatform : IPlatformServices
{
    private readonly Func<PhotinoWindow> _window;
    private readonly HostLog _log;

    public PhotinoPlatform(Func<PhotinoWindow> window, string bundledPluginsDir, HostLog log)
    {
        _window = window;
        BundledPluginsDir = bundledPluginsDir;
        _log = log;
    }

    public string BundledPluginsDir { get; }

    // Native dialogs belong to the UI thread; requests arrive on thread-pool threads.
    private Task<T> OnUiThread<T>(Func<PhotinoWindow, T> action)
    {
        var window = _window();
        return Task.FromResult(PhotinoApplication.Current.Dispatcher.Invoke(() => action(window)));
    }

    public async Task<string?> PickFolderAsync()
    {
        var picked = await OnUiThread(w => w.ShowOpenFolder("Select notes folder", null, false));
        return picked is { Length: > 0 } ? picked[0] : null;
    }

    public Task OpenExternalAsync(string url)
    {
        // The caller has already restricted this to http(s)/mailto URLs.
        Process.Start(new ProcessStartInfo(url) { UseShellExecute = true });
        return Task.CompletedTask;
    }

    public void ShowItemInFolder(string absPath)
    {
        if (OperatingSystem.IsWindows())
        {
            Process.Start(new ProcessStartInfo("explorer.exe") { ArgumentList = { "/select,", absPath }, UseShellExecute = false });
        }
        else if (OperatingSystem.IsMacOS())
        {
            Process.Start(new ProcessStartInfo("open") { ArgumentList = { "-R", absPath }, UseShellExecute = false });
        }
        else
        {
            var dir = Directory.Exists(absPath) ? absPath : Path.GetDirectoryName(absPath) ?? absPath;
            Process.Start(new ProcessStartInfo("xdg-open") { ArgumentList = { dir }, UseShellExecute = false });
        }
    }

    public async Task<bool> SaveTextFileAsync(string defaultName, string content, IReadOnlyList<SaveDialogFilter> filters)
    {
        var native = filters.Select(f => (f.Name, f.Extensions)).ToArray();
        var chosen = await OnUiThread(w => w.ShowSaveFile("Save", null, native, defaultName));
        if (string.IsNullOrEmpty(chosen)) return false;
        await Files.WriteTextAsync(chosen, content);
        return true;
    }

    public Task<bool> SavePdfFromHtmlAsync(string defaultName, string htmlContent)
    {
        _log.Info($"PDF export requested for {defaultName}, which the C# build does not support yet");
        throw new NotSupportedException("PDF export is not available in the C# build yet. Export to HTML instead and print it to PDF from a browser.");
    }

    public async Task<bool> ConfirmPluginPermissionAsync(string pluginName, string permission, string detail)
    {
        var result = await OnUiThread(w => w.ShowMessage(
            "Plugin permission request",
            $"\"{pluginName}\" wants to use \"{permission}\"\n\n{detail}\n\nAllow it?",
            PhotinoDialogButtons.YesNo,
            PhotinoDialogIcon.Question));
        return result == PhotinoDialogResult.Yes;
    }

    // The window controls are drawn by the page itself (bridge.js), which also recolors them and shows its own
    // system menu, so neither needs the native window.
    public void SetTitleBarOverlay(string color, string symbolColor) { }

    public Task ShowSystemMenuAsync(double x, double y) => Task.CompletedTask;

    public Task<bool> WindowActionAsync(string action)
    {
        var window = _window();
        var maximized = PhotinoApplication.Current.Dispatcher.Invoke(() =>
        {
            switch (action)
            {
                case "minimize":
                    window.WindowState = PhotinoWindowState.Minimized;
                    break;
                case "toggleMaximize":
                    window.WindowState = window.WindowState == PhotinoWindowState.Maximized
                        ? PhotinoWindowState.Normal
                        : PhotinoWindowState.Maximized;
                    break;
                case "close":
                    window.Close();
                    break;
                case "drag":
                    window.BeginWindowDrag();
                    break;
                case var a when a.StartsWith("resize:", StringComparison.Ordinal)
                    && Enum.TryParse<PhotinoWindowEdge>(a["resize:".Length..], out var edge):
                    window.BeginWindowResize(edge);
                    break;
            }
            return window.WindowState == PhotinoWindowState.Maximized;
        });
        return Task.FromResult(maximized);
    }
}
