using Cairn.Core.App;

namespace Cairn.Mobile;

/// <summary>
/// Mobile has no desktop window or free-form directory picker, so most of IPlatformServices is unsupported
/// or a no-op. Folder creation goes through the managed notes root instead of PickFolderAsync.
/// </summary>
internal sealed class MobilePlatform : IPlatformServices
{
	public Task<string?> PickFolderAsync() => Task.FromResult<string?>(null);

	public Task OpenExternalAsync(string url) => Launcher.Default.OpenAsync(url);

	public void ShowItemInFolder(string absPath) { }

	public Task<bool> SaveTextFileAsync(string defaultName, string content, IReadOnlyList<SaveDialogFilter> filters) =>
		throw new NotSupportedException("Export is not available on mobile yet.");

	public Task<bool> SavePdfFromHtmlAsync(string defaultName, string htmlContent) =>
		throw new NotSupportedException("PDF export is not available on mobile yet.");

	public Task<bool> ConfirmPluginPermissionAsync(string pluginName, string permission, string detail) =>
		Task.FromResult(false);

	public void SetTitleBarOverlay(string color, string symbolColor) { }

	public Task ShowSystemMenuAsync(double x, double y) => Task.CompletedTask;

	public Task<bool> WindowActionAsync(string action) => Task.FromResult(false);

	public string BundledPluginsDir => Path.Combine(AppContext.BaseDirectory, "plugins");
}
