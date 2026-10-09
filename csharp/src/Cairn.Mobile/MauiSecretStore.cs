using Cairn.Core.Sync;

namespace Cairn.Mobile;

/// <summary>MAUI SecureStorage: the Android Keystore (and the iOS Keychain), so the token is encrypted at rest.</summary>
internal sealed class MauiSecretStore : ISecretStore
{
	public bool IsAvailable => true;

	public Task<string?> GetAsync(string key) => SecureStorage.Default.GetAsync(key);

	public Task SetAsync(string key, string value) => SecureStorage.Default.SetAsync(key, value);

	public Task DeleteAsync(string key)
	{
		SecureStorage.Default.Remove(key);
		return Task.CompletedTask;
	}
}
