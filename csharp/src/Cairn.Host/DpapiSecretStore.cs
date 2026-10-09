using System.Security.Cryptography;
using System.Text;
using Cairn.Core.Sync;

namespace Cairn.Host;

/// <summary>
/// Windows DPAPI: each secret is encrypted for the current user and stored as a file, the equivalent of Electron's
/// safeStorage. Separate files from Electron's, which can't read DPAPI blobs (and vice versa), so the two apps never
/// clobber each other's token; sign in once in each.
/// </summary>
internal sealed class DpapiSecretStore(string directory) : ISecretStore
{
    public bool IsAvailable => OperatingSystem.IsWindows();

    private string FileFor(string key) => Path.Combine(directory, key + ".dpapi");

    public Task<string?> GetAsync(string key)
    {
        var file = FileFor(key);
        if (!File.Exists(file)) return Task.FromResult<string?>(null);
        var plain = ProtectedData.Unprotect(File.ReadAllBytes(file), null, DataProtectionScope.CurrentUser);
        return Task.FromResult<string?>(Encoding.UTF8.GetString(plain));
    }

    public Task SetAsync(string key, string value)
    {
        Directory.CreateDirectory(directory);
        File.WriteAllBytes(FileFor(key), ProtectedData.Protect(Encoding.UTF8.GetBytes(value), null, DataProtectionScope.CurrentUser));
        return Task.CompletedTask;
    }

    public Task DeleteAsync(string key)
    {
        File.Delete(FileFor(key));
        return Task.CompletedTask;
    }
}
