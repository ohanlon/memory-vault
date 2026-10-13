using System.Text;
using System.Text.RegularExpressions;
using Cairn.Core.Sync;
using Xunit;

namespace Cairn.Core.Tests;

internal sealed class FakeToolRunner(Func<string, IReadOnlyList<string>, string?, ProcessResult> handler) : IProcessRunner
{
    public HashSet<string> Existing { get; } = new();
    public List<(string Tool, string[] Args, string? Stdin)> Calls { get; } = new();

    public bool Exists(string tool) => Existing.Contains(tool);

    public Task<ProcessResult> RunAsync(string tool, IReadOnlyList<string> arguments, string? stdin = null)
    {
        Calls.Add((tool, arguments.ToArray(), stdin));
        return Task.FromResult(handler(tool, arguments, stdin));
    }
}

/// <summary>macOS's `security` as documented: -i reads commands from stdin; find -w prints the password; 44 is "not found".</summary>
internal sealed class FakeSecurity
{
    public Dictionary<string, string> Items { get; } = new(); // "service/account" -> stored password text
    public bool SilentlyDropWrites { get; set; }

    private static string Arg(IReadOnlyList<string> args, string flag) => args[args.ToList().IndexOf(flag) + 1];

    public ProcessResult Handle(string tool, IReadOnlyList<string> args, string? stdin)
    {
        switch (args[0])
        {
            case "find-generic-password":
                return Items.TryGetValue($"{Arg(args, "-s")}/{Arg(args, "-a")}", out var value)
                    ? new ProcessResult(0, value + "\n", "")
                    : new ProcessResult(44, "", "security: SecKeychainSearchCopyNext: The specified item could not be found in the keychain.");
            case "delete-generic-password":
                return Items.Remove($"{Arg(args, "-s")}/{Arg(args, "-a")}")
                    ? new ProcessResult(0, "", "")
                    : new ProcessResult(44, "", "security: SecKeychainSearchCopyNext: The specified item could not be found in the keychain.");
            case "-i":
                foreach (var line in (stdin ?? "").Split('\n', StringSplitOptions.RemoveEmptyEntries))
                {
                    var m = Regex.Match(line, @"^add-generic-password -U -s (\S+) -a (\S+) -w '([^']*)'$");
                    if (!m.Success) return new ProcessResult(1, "", $"unrecognised command: {line}");
                    if (!SilentlyDropWrites) Items[$"{m.Groups[1].Value}/{m.Groups[2].Value}"] = m.Groups[3].Value;
                }
                return new ProcessResult(0, "", ""); // like the real tool, exit 0 whether or not anything was stored
            default:
                return new ProcessResult(1, "", "unknown command");
        }
    }
}

/// <summary>libsecret's `secret-tool` as measured: a missing item is exit 1 with empty stderr; real failures print to stderr.</summary>
internal sealed class FakeSecretTool
{
    public Dictionary<string, string> Items { get; } = new(); // "service/account" -> secret
    public string? BrokenWith { get; set; }                   // simulates e.g. no session bus

    public ProcessResult Handle(string tool, IReadOnlyList<string> args, string? stdin)
    {
        if (BrokenWith is not null) return new ProcessResult(1, "", BrokenWith);
        var rest = args.Skip(1).ToList();
        var labelAt = rest.IndexOf("--label");
        if (labelAt >= 0) rest.RemoveRange(labelAt, 2);
        var key = $"{rest[rest.IndexOf("service") + 1]}/{rest[rest.IndexOf("account") + 1]}";

        switch (args[0])
        {
            case "store":
                Items[key] = stdin ?? "";
                return new ProcessResult(0, "", "");
            case "lookup":
                return Items.TryGetValue(key, out var v) ? new ProcessResult(0, v, "") : new ProcessResult(1, "", "");
            case "clear":
                return Items.Remove(key) ? new ProcessResult(0, "", "") : new ProcessResult(1, "", "");
            default:
                return new ProcessResult(2, "", "usage");
        }
    }
}

public class MacKeychainSecretStoreTests
{
    private const string Secret = "gho_SuperSecretToken123";
    private readonly FakeSecurity _tool = new();
    private readonly FakeToolRunner _runner;
    private readonly MacKeychainSecretStore _store;

    public MacKeychainSecretStoreTests()
    {
        _runner = new FakeToolRunner(_tool.Handle);
        _runner.Existing.Add("/usr/bin/security");
        _store = new MacKeychainSecretStore(_runner);
    }

    [Fact]
    public async Task ASecretRoundTripsAndCanBeOverwrittenAndDeleted()
    {
        Assert.Null(await _store.GetAsync("github-token"));

        await _store.SetAsync("github-token", Secret);
        Assert.Equal(Secret, await _store.GetAsync("github-token"));

        await _store.SetAsync("github-token", "second");
        Assert.Equal("second", await _store.GetAsync("github-token"));

        await _store.DeleteAsync("github-token");
        Assert.Null(await _store.GetAsync("github-token"));
        await _store.DeleteAsync("github-token"); // deleting what isn't there is not an error
    }

    [Fact]
    public async Task TheSecretNeverAppearsOnAnyCommandLine()
    {
        await _store.SetAsync("github-token", Secret);
        await _store.GetAsync("github-token");
        await _store.DeleteAsync("github-token");

        var base64 = Convert.ToBase64String(Encoding.UTF8.GetBytes(Secret));
        foreach (var call in _runner.Calls)
        {
            var argv = string.Join(' ', call.Args);
            Assert.DoesNotContain(Secret, argv);
            Assert.DoesNotContain(base64, argv);
        }
    }

    [Fact]
    public async Task TheSecretTravelsOverStdinToSecurityInteractiveModeAsBase64()
    {
        await _store.SetAsync("github-token", Secret);

        var write = _runner.Calls.First(c => c.Args.SequenceEqual(new[] { "-i" }));
        Assert.StartsWith("add-generic-password -U -s Cairn -a github-token -w '", write.Stdin);
        Assert.EndsWith("'\n", write.Stdin);
        Assert.DoesNotContain(Secret, write.Stdin);
        Assert.Contains(Convert.ToBase64String(Encoding.UTF8.GetBytes(Secret)), write.Stdin);
    }

    [Fact]
    public async Task UnicodeAndOddCharactersSurviveTheTrip()
    {
        const string odd = "pässwörd ☕ with 'quotes' and \"doubles\" and spaces";
        await _store.SetAsync("github-token", odd);
        Assert.Equal(odd, await _store.GetAsync("github-token"));
    }

    [Fact]
    public async Task AWriteThatExitsZeroButStoresNothingIsCaught()
    {
        // The real tool does this when the password has to come from a terminal: exit 0, empty password.
        _tool.SilentlyDropWrites = true;

        var e = await Assert.ThrowsAsync<InvalidOperationException>(() => _store.SetAsync("github-token", Secret));

        Assert.Contains("did not keep the secret", e.Message);
    }

    [Fact]
    public async Task ARealFailureIsReportedWithTheToolsMessage()
    {
        var failing = new FakeToolRunner((_, _, _) => new ProcessResult(36, "", "User interaction is not allowed."));
        var store = new MacKeychainSecretStore(failing);

        var e = await Assert.ThrowsAsync<InvalidOperationException>(() => store.GetAsync("github-token"));

        Assert.Contains("exit 36", e.Message);
        Assert.Contains("User interaction is not allowed.", e.Message);
    }

    [Fact]
    public async Task SomethingElseStoredUnderTheSameNameReadsAsNotOurs()
    {
        _tool.Items["Cairn/github-token"] = "not base64 !!";
        Assert.Null(await _store.GetAsync("github-token"));
    }

    [Theory]
    [InlineData("has space")]
    [InlineData("quote'")]
    [InlineData("a;b")]
    [InlineData("")]
    public async Task UnsafeKeysAreRefusedBecauseTheyGoIntoACommandLine(string key)
    {
        await Assert.ThrowsAsync<ArgumentException>(() => _store.SetAsync(key, "x"));
        await Assert.ThrowsAsync<ArgumentException>(() => _store.GetAsync(key));
        Assert.Empty(_runner.Calls);
    }

    [Fact]
    public void AvailabilityFollowsTheToolBeingPresent()
    {
        Assert.True(_store.IsAvailable);
        Assert.Null(_store.UnavailableReason);

        var missing = new MacKeychainSecretStore(new FakeToolRunner(_tool.Handle));
        Assert.False(missing.IsAvailable);
        Assert.Contains("security tool", missing.UnavailableReason);
    }
}

public class LinuxSecretStoreTests
{
    private const string Secret = "gho_SuperSecretToken123";
    private readonly FakeSecretTool _tool = new();
    private readonly FakeToolRunner _runner;
    private readonly Dictionary<string, string> _env = new() { ["DBUS_SESSION_BUS_ADDRESS"] = "unix:path=/run/user/1000/bus" };
    private readonly LinuxSecretStore _store;

    public LinuxSecretStoreTests()
    {
        _runner = new FakeToolRunner(_tool.Handle);
        _runner.Existing.Add("secret-tool");
        _store = new LinuxSecretStore(_runner, name => _env.GetValueOrDefault(name));
    }

    [Fact]
    public async Task ASecretRoundTripsAndCanBeOverwrittenAndDeleted()
    {
        Assert.Null(await _store.GetAsync("github-token"));

        await _store.SetAsync("github-token", Secret);
        Assert.Equal(Secret, await _store.GetAsync("github-token"));

        await _store.SetAsync("github-token", "second");
        Assert.Equal("second", await _store.GetAsync("github-token"));

        await _store.DeleteAsync("github-token");
        Assert.Null(await _store.GetAsync("github-token"));
        await _store.DeleteAsync("github-token"); // clearing what isn't there is not an error
    }

    [Fact]
    public async Task TheSecretIsSentOverStdinExactlyAndNeverOnTheCommandLine()
    {
        await _store.SetAsync("github-token", Secret);
        await _store.GetAsync("github-token");
        await _store.DeleteAsync("github-token");

        var store = _runner.Calls.First(c => c.Args[0] == "store");
        Assert.Equal(Secret, store.Stdin); // no trailing newline: secret-tool would keep it as part of the secret
        foreach (var call in _runner.Calls) Assert.DoesNotContain(Secret, string.Join(' ', call.Args));
    }

    [Fact]
    public async Task AMissingItemIsNullButARealFailureIsAnError()
    {
        Assert.Null(await _store.GetAsync("github-token")); // exit 1, empty stderr

        _tool.BrokenWith = "secret-tool: Error calling StartServiceByName for org.freedesktop.secrets: Timeout was reached";
        var read = await Assert.ThrowsAsync<InvalidOperationException>(() => _store.GetAsync("github-token"));
        var write = await Assert.ThrowsAsync<InvalidOperationException>(() => _store.SetAsync("github-token", Secret));
        var delete = await Assert.ThrowsAsync<InvalidOperationException>(() => _store.DeleteAsync("github-token"));

        Assert.Contains("StartServiceByName", read.Message);
        Assert.Contains("write failed", write.Message);
        Assert.Contains("delete failed", delete.Message);
    }

    [Fact]
    public async Task DifferentKeysAreIndependent()
    {
        await _store.SetAsync("a", "1");
        await _store.SetAsync("b", "2");
        await _store.DeleteAsync("a");

        Assert.Null(await _store.GetAsync("a"));
        Assert.Equal("2", await _store.GetAsync("b"));
    }

    [Fact]
    public void AvailabilityNeedsTheToolAndASessionBus()
    {
        Assert.True(_store.IsAvailable);
        Assert.Null(_store.UnavailableReason);

        var noTool = new LinuxSecretStore(new FakeToolRunner(_tool.Handle), name => _env.GetValueOrDefault(name));
        Assert.False(noTool.IsAvailable);
        Assert.Contains("libsecret-tools", noTool.UnavailableReason);

        _env.Clear();
        Assert.False(_store.IsAvailable);
        Assert.Contains("session bus", _store.UnavailableReason);
    }

    [Fact]
    public void TheRuntimeDirectorySocketCountsAsASessionBus()
    {
        _env.Clear();
        _env["XDG_RUNTIME_DIR"] = "/run/user/1000";
        Assert.False(_store.IsAvailable);

        _runner.Existing.Add(Path.Combine("/run/user/1000", "bus"));
        Assert.True(_store.IsAvailable);
    }
}

public class SecretStoreWiringTests
{
    [Fact]
    public async Task SigningInExplainsWhyWhenNoStoreIsAvailable()
    {
        var store = new UnavailableSecretStore("install libsecret-tools");

        var e = await Assert.ThrowsAsync<InvalidOperationException>(() => GithubAuth.WriteTokenAsync(store, "t"));

        Assert.Equal("Secure storage is not available on this system: install libsecret-tools.", e.Message);
    }

    [Fact]
    public async Task ATokenGoesThroughAStoreAndBackViaTheAuthHelpers()
    {
        var tool = new FakeSecretTool();
        var runner = new FakeToolRunner(tool.Handle);
        runner.Existing.Add("secret-tool");
        var store = new LinuxSecretStore(runner, name => name == "DBUS_SESSION_BUS_ADDRESS" ? "unix:path=/x" : null);

        await GithubAuth.WriteTokenAsync(store, "gho_abc");

        Assert.Equal("gho_abc", await GithubAuth.ReadTokenAsync(store));
        await GithubAuth.DeleteTokenAsync(store);
        Assert.Null(await GithubAuth.ReadTokenAsync(store));
    }

    [Fact]
    public async Task AFailingStoreReadsAsNotConnectedRatherThanThrowing()
    {
        var tool = new FakeSecretTool { BrokenWith = "secret-tool: no bus" };
        var runner = new FakeToolRunner(tool.Handle);
        runner.Existing.Add("secret-tool");
        var store = new LinuxSecretStore(runner, name => name == "DBUS_SESSION_BUS_ADDRESS" ? "unix:path=/x" : null);

        Assert.Null(await GithubAuth.ReadTokenAsync(store));
    }
}

/// <summary>Skipped unless CAIRN_TEST_REAL_KEYRING=1, so it only runs where a real keyring is deliberately available.</summary>
public sealed class RealKeyringFactAttribute : FactAttribute
{
    public RealKeyringFactAttribute()
    {
        if (Environment.GetEnvironmentVariable("CAIRN_TEST_REAL_KEYRING") != "1")
            Skip = "Set CAIRN_TEST_REAL_KEYRING=1 on a machine with a real keyring (Linux: secret-tool + an unlocked Secret Service; macOS: the login Keychain).";
    }
}

public class RealKeyringTests
{
    [RealKeyringFact]
    public async Task ThePlatformStoreWorksAgainstTheRealKeyring()
    {
        var store = PlatformSecretStore.Create();
        Assert.True(store.IsAvailable, store.UnavailableReason);
        const string key = "cairn-test-token";
        try
        {
            await store.DeleteAsync(key);
            Assert.Null(await store.GetAsync(key));

            await store.SetAsync(key, "first ☕ 'value' \"x\"");
            Assert.Equal("first ☕ 'value' \"x\"", await store.GetAsync(key));

            await store.SetAsync(key, "second");
            Assert.Equal("second", await store.GetAsync(key));
        }
        finally
        {
            await store.DeleteAsync(key);
        }
        Assert.Null(await store.GetAsync(key));
    }
}
