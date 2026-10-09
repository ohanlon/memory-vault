namespace Cairn.Core.Sync;

/// <summary>
/// For a host with no OS-backed secret storage. Reports itself unavailable, so signing in fails with a clear message
/// instead of writing a token to disk in plaintext.
/// </summary>
public sealed class UnavailableSecretStore : ISecretStore
{
    public bool IsAvailable => false;
    public Task<string?> GetAsync(string key) => Task.FromResult<string?>(null);
    public Task SetAsync(string key, string value) => throw new InvalidOperationException("Secure storage is not available on this system");
    public Task DeleteAsync(string key) => Task.CompletedTask;
}
