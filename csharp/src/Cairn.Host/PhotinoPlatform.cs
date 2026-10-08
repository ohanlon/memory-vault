using System.Diagnostics;
using System.Drawing;
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

    /// <summary>Raised when the window enters or leaves the maximized state (so the page can swap its icon).</summary>
    public Action<bool>? MaximizedChanged { get; set; }

    // A frameless Win32 window maximizes over the whole monitor, taskbar included. When the page draws the
    // chrome, "maximized" is therefore implemented by hand: fill the monitor's work area and remember the
    // bounds to go back to.
    private Rectangle? _restoreBounds;
    public bool Chromeless { get; set; }

    private bool IsMaximized(PhotinoWindow window) =>
        _restoreBounds is not null || window.WindowState == PhotinoWindowState.Maximized;

    private void Maximize(PhotinoWindow window)
    {
        if (!Chromeless)
        {
            window.WindowState = PhotinoWindowState.Maximized;
            return;
        }
        var bounds = new Rectangle(window.Location, window.Size);
        var center = new Point(bounds.X + bounds.Width / 2, bounds.Y + bounds.Height / 2);
        var monitors = window.Monitors;
        var target = monitors.Count == 0
            ? window.MainMonitor
            : monitors.FirstOrDefault(m => m.MonitorArea.Contains(center), window.MainMonitor);
        _restoreBounds = bounds;
        window.Location = target.WorkArea.Location;
        window.Size = target.WorkArea.Size;
    }

    private void Restore(PhotinoWindow window)
    {
        if (_restoreBounds is { } bounds)
        {
            _restoreBounds = null;
            window.Size = bounds.Size;
            window.Location = bounds.Location;
        }
        else
        {
            window.WindowState = PhotinoWindowState.Normal;
        }
    }

    /// <summary>Turns a native maximize (Win+Up, a snap gesture) into the work-area-sized one.</summary>
    public void OnNativeStateChanged(PhotinoWindowState newState)
    {
        if (!Chromeless || newState != PhotinoWindowState.Maximized) return;
        var window = _window();
        window.WindowState = PhotinoWindowState.Normal;
        Maximize(window);
        MaximizedChanged?.Invoke(true);
    }

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
                    if (IsMaximized(window)) Restore(window);
                    else Maximize(window);
                    break;
                case "close":
                    window.Close();
                    break;
                case "drag":
                    // Dragging a maximized window pulls it back to its normal size first, as Windows does.
                    if (_restoreBounds is not null) Restore(window);
                    window.BeginWindowDrag();
                    break;
                case var a when a.StartsWith("resize:", StringComparison.Ordinal)
                    && Enum.TryParse<PhotinoWindowEdge>(a["resize:".Length..], out var edge):
                    window.BeginWindowResize(edge);
                    break;
            }
            return IsMaximized(window);
        });
        if (action is "toggleMaximize" or "drag") MaximizedChanged?.Invoke(maximized);
        return Task.FromResult(maximized);
    }
}
