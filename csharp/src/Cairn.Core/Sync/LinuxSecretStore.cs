namespace Cairn.Core.Sync;

/// <summary>
/// The freedesktop Secret Service (GNOME Keyring, KWallet, ...), through libsecret's <c>secret-tool</c> command.
///
/// The secret goes to <c>secret-tool store</c> over stdin, never on the command line. Its exit codes are not
/// documented, so these are what was measured against a real keyring: a missing item is exit 1 with empty stderr
/// (for lookup and clear alike), while a real failure (no session bus, locked keyring) is a non-zero exit with a
/// message on stderr.
/// </summary>
public sealed class LinuxSecretStore(IProcessRunner runner, Func<string, string?>? environment = null) : ISecretStore
{
    private const string Tool = "secret-tool";
    private const string Service = "cairn";

    private readonly Func<string, string?> _env = environment ?? Environment.GetEnvironmentVariable;

    // secret-tool talks to the keyring over the session bus; without one it stalls for a long time before failing,
    // so it is checked up front rather than on every call.
    private bool HasSessionBus() =>
        !string.IsNullOrEmpty(_env("DBUS_SESSION_BUS_ADDRESS"))
        || (_env("XDG_RUNTIME_DIR") is { Length: > 0 } runtime && runner.Exists(Path.Combine(runtime, "bus")));

    public bool IsAvailable => runner.Exists(Tool) && HasSessionBus();

    public string? UnavailableReason =>
        !runner.Exists(Tool) ? "install libsecret-tools (the secret-tool command) and a keyring such as GNOME Keyring or KWallet"
        : !HasSessionBus() ? "no desktop session bus was found, so there is no keyring to talk to"
        : null;

    private static InvalidOperationException Failure(string what, ProcessResult r) =>
        new($"The Secret Service {what} failed (exit {r.ExitCode}): {r.StdErr.Trim()}");

    // A missing item is the one failure with nothing on stderr.
    private static bool IsNotFound(ProcessResult r) => r.ExitCode == 1 && r.StdErr.Trim().Length == 0;

    public async Task<string?> GetAsync(string key)
    {
        var result = await runner.RunAsync(Tool, new[] { "lookup", "service", Service, "account", key });
        if (result.ExitCode == 0) return result.StdOut;
        if (IsNotFound(result)) return null;
        throw Failure("lookup", result);
    }

    public async Task SetAsync(string key, string value)
    {
        // The value is stdin as-is (no trailing newline, which secret-tool would store as part of the secret).
        var result = await runner.RunAsync(Tool, new[] { "store", "--label", $"Cairn: {key}", "service", Service, "account", key }, value);
        if (result.ExitCode != 0) throw Failure("write", result);
    }

    public async Task DeleteAsync(string key)
    {
        var result = await runner.RunAsync(Tool, new[] { "clear", "service", Service, "account", key });
        if (result.ExitCode != 0 && !IsNotFound(result)) throw Failure("delete", result);
    }
}
