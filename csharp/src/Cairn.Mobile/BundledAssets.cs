namespace Cairn.Mobile;

/// <summary>
/// Files packaged as app assets live inside the APK, but the core reads plugins from a real directory, so the
/// bundled plugins are copied out at startup. They are small, so the destination is rebuilt every launch
/// (BundledPlugins.Seed then decides what to install from there).
/// </summary>
internal static class BundledAssets
{
	public static void Extract(string assetDir, string destDir)
	{
		if (Directory.Exists(destDir)) Directory.Delete(destDir, recursive: true);
		Directory.CreateDirectory(destDir);
#if ANDROID
		var assets = Android.App.Application.Context.Assets
			?? throw new InvalidOperationException("Android asset manager is unavailable");
		Copy(assets, assetDir, destDir);
#endif
	}

#if ANDROID
	// AssetManager.List returns a directory's children and nothing for a file, which is how the two are told apart.
	private static void Copy(Android.Content.Res.AssetManager assets, string assetPath, string destPath)
	{
		foreach (var name in assets.List(assetPath) ?? Array.Empty<string>())
		{
			var childAsset = assetPath + "/" + name;
			var childDest = Path.Combine(destPath, name);
			if ((assets.List(childAsset) ?? Array.Empty<string>()).Length > 0)
			{
				Directory.CreateDirectory(childDest);
				Copy(assets, childAsset, childDest);
				continue;
			}
			using var source = assets.Open(childAsset);
			using var target = File.Create(childDest);
			source.CopyTo(target);
		}
	}
#endif
}
