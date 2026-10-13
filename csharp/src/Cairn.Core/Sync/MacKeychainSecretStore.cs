using System.Text;
using System.Text.RegularExpressions;

namespace Cairn.Core.Sync;

/// <summary>
/// The macOS login Keychain, through the built-in <c>security</c> tool.
///
/// The secret never appears on a command line (any process can read those): it is sent over stdin to
/// <c>security -i</c>. That is also the only way that works, because <c>add-generic-password -w</c> with no value reads
/// from the terminal, not from stdin, and quietly stores an empty password with exit status 0. Since that failure is
/// silent, every write is read back and compared.
///
/// Known limit: an item created through the <c>security</c> tool is readable by any process running as the same user
/// via <c>security find-generic-password -w</c>, without a Keychain prompt. A native Keychain API (an item whose access
/// list names only this app) would be stricter; this is the trade-off of using the tool.
/// </summary>
public sealed partial class MacKeychainSecretStore(IProcessRunner runner) : ISecretStore
{
    private const string Security = "/usr/bin/security";
    private const string Service = "Cairn";
    private const int ItemNotFound = 44; // errSecItemNotFound

    // Used unquoted inside the interactive command line, so keep it to a safe alphabet.
    [GeneratedRegex("^[A-Za-z0-9._-]+$")]
    private static partial Regex SafeKey();

    public bool IsAvailable => runner.Exists(Security);

    public string? UnavailableReason => IsAvailable ? null : "the macOS security tool was not found";

    private static void CheckKey(string key)
    {
        if (!SafeKey().IsMatch(key)) throw new ArgumentException("Secret keys may only contain letters, digits, '.', '_' and '-'.", nameof(key));
    }

    // The value is stored as base64 text so it is always printable: `find-generic-password -w` prints non-printable
    // data as hex, and nothing in it needs quoting in the interactive command.
    private static string Encode(string value) => Convert.ToBase64String(Encoding.UTF8.GetBytes(value));

    private static string? Decode(string stored)
    {
        try { return Encoding.UTF8.GetString(Convert.FromBase64String(stored)); }
        catch (FormatException) { return null; } // not something this app wrote
    }

    private static InvalidOperationException Failure(string what, ProcessResult r) =>
        new($"The macOS Keychain {what} failed (exit {r.ExitCode}): {r.StdErr.Trim()}");

    public async Task<string?> GetAsync(string key)
    {
        CheckKey(key);
        var result = await runner.RunAsync(Security, new[] { "find-generic-password", "-s", Service, "-a", key, "-w" });
        if (result.ExitCode == ItemNotFound) return null;
        if (result.ExitCode != 0) throw Failure("lookup", result);
        return Decode(result.StdOut.Trim());
    }

    public async Task SetAsync(string key, string value)
    {
        CheckKey(key);
        var command = $"add-generic-password -U -s {Service} -a {key} -w '{Encode(value)}'\n";
        var result = await runner.RunAsync(Security, new[] { "-i" }, command);
        if (result.ExitCode != 0) throw Failure("write", result);

        if (await GetAsync(key) != value)
            throw new InvalidOperationException("The macOS Keychain did not keep the secret that was written.");
    }

    public async Task DeleteAsync(string key)
    {
        CheckKey(key);
        var result = await runner.RunAsync(Security, new[] { "delete-generic-password", "-s", Service, "-a", key });
        if (result.ExitCode != 0 && result.ExitCode != ItemNotFound) throw Failure("delete", result);
    }
}
