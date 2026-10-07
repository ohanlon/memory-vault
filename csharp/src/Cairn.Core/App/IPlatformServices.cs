namespace Cairn.Core.App;

public sealed record SaveDialogFilter(string Name, string[] Extensions);

/// <summary>
/// Everything the app needs from the operating system or the window that the shared core can't do itself —
/// the equivalents of Electron's <c>dialog</c>, <c>shell</c> and <c>BrowserWindow</c> APIs. Implemented by the host.
/// </summary>
public interface IPlatformServices
{
    /// <summary>Directory picker; null if cancelled.</summary>
    Task<string?> PickFolderAsync();

    /// <summary>Hands a URL to the OS default handler.</summary>
    Task OpenExternalAsync(string url);

    /// <summary>Reveals a file or folder in the OS file manager.</summary>
    void ShowItemInFolder(string absPath);

    /// <summary>Save dialog + write; false if cancelled.</summary>
    Task<bool> SaveTextFileAsync(string defaultName, string content, IReadOnlyList<SaveDialogFilter> filters);

    /// <summary>Renders HTML to a paginated PDF the user saves via a dialog; false if cancelled.</summary>
    Task<bool> SavePdfFromHtmlAsync(string defaultName, string htmlContent);

    /// <summary>The "plugin wants permission" prompt; true if the user allowed it.</summary>
    Task<bool> ConfirmPluginPermissionAsync(string pluginName, string permission, string detail);

    /// <summary>Colors for the native window-control overlay (a no-op where unsupported).</summary>
    void SetTitleBarOverlay(string color, string symbolColor);

    /// <summary>Pops up the minimize/maximize/close menu at window coordinates.</summary>
    Task ShowSystemMenuAsync(double x, double y);

    /// <summary>Directory holding the plugins that ship inside the app.</summary>
    string BundledPluginsDir { get; }
}
