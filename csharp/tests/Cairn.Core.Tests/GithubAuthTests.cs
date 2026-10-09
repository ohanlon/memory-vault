using System.Net;
using System.Text.Json.Nodes;
using Cairn.Core.Sync;
using Xunit;

namespace Cairn.Core.Tests;

public class GithubAuthTests
{
    private static readonly DeviceFlowStart Start = new("dev123", "ABCD-1234", "https://github.com/login/device", 5, 900);

    private static Task Instant(TimeSpan _, CancellationToken __) => Task.CompletedTask;

    [Fact]
    public async Task StartDeviceFlowReturnsTheCodesToShow()
    {
        var start = await GithubAuth.StartDeviceFlowAsync(new HttpClient(new FakeGithub()), "client");

        Assert.Equal("dev123", start.DeviceCode);
        Assert.Equal("ABCD-1234", start.UserCode);
        Assert.Equal("https://github.com/login/device", start.VerificationUri);
        Assert.Equal(5, start.Interval);
    }

    [Theory]
    [InlineData("")]
    [InlineData("REPLACE_ME")]
    public async Task StartDeviceFlowRefusesAnUnconfiguredClientId(string clientId)
    {
        var e = await Assert.ThrowsAsync<InvalidOperationException>(() => GithubAuth.StartDeviceFlowAsync(new HttpClient(new FakeGithub()), clientId));
        Assert.Contains("isn't configured", e.Message);
    }

    [Fact]
    public async Task PollKeepsWaitingUntilTheUserAuthorises()
    {
        var github = new FakeGithub();
        github.TokenResponses.Enqueue(new JsonObject { ["error"] = "authorization_pending" });
        github.TokenResponses.Enqueue(new JsonObject { ["error"] = "authorization_pending" });
        github.TokenResponses.Enqueue(new JsonObject { ["access_token"] = "gho_abc" });
        var waits = new List<TimeSpan>();

        var token = await GithubAuth.PollForTokenAsync(new HttpClient(github), "client", Start, CancellationToken.None,
            (span, _) => { waits.Add(span); return Task.CompletedTask; });

        Assert.Equal("gho_abc", token);
        Assert.Equal(3, waits.Count);
        Assert.All(waits, w => Assert.Equal(TimeSpan.FromSeconds(5), w));
    }

    [Fact]
    public async Task PollBacksOffWhenGithubSaysSlowDown()
    {
        var github = new FakeGithub();
        github.TokenResponses.Enqueue(new JsonObject { ["error"] = "slow_down", ["interval"] = 10 });
        github.TokenResponses.Enqueue(new JsonObject { ["access_token"] = "t" });
        var waits = new List<TimeSpan>();

        await GithubAuth.PollForTokenAsync(new HttpClient(github), "client", Start, CancellationToken.None,
            (span, _) => { waits.Add(span); return Task.CompletedTask; });

        Assert.Equal(new[] { TimeSpan.FromSeconds(5), TimeSpan.FromSeconds(10) }, waits);
    }

    [Theory]
    [InlineData("expired_token", "The sign-in code expired. Try again.")]
    [InlineData("access_denied", "Authorisation was denied.")]
    public async Task PollReportsTerminalErrors(string error, string expected)
    {
        var github = new FakeGithub();
        github.TokenResponses.Enqueue(new JsonObject { ["error"] = error });

        var e = await Assert.ThrowsAsync<InvalidOperationException>(() =>
            GithubAuth.PollForTokenAsync(new HttpClient(github), "client", Start, CancellationToken.None, Instant));

        Assert.Equal(expected, e.Message);
    }

    [Fact]
    public async Task PollSurfacesGithubsOwnDescriptionForOtherErrors()
    {
        var github = new FakeGithub();
        github.TokenResponses.Enqueue(new JsonObject { ["error"] = "unsupported_grant_type", ["error_description"] = "Device flow is not enabled." });

        var e = await Assert.ThrowsAsync<InvalidOperationException>(() =>
            GithubAuth.PollForTokenAsync(new HttpClient(github), "client", Start, CancellationToken.None, Instant));

        Assert.Equal("Device flow is not enabled.", e.Message);
    }

    [Fact]
    public async Task PollGivesUpOnceTheCodeHasExpired()
    {
        var clock = DateTimeOffset.UtcNow;
        var e = await Assert.ThrowsAsync<InvalidOperationException>(() =>
            GithubAuth.PollForTokenAsync(new HttpClient(new FakeGithub()), "client", Start with { ExpiresIn = 10 }, CancellationToken.None,
                (span, _) => { clock += span; return Task.CompletedTask; }, () => clock));

        Assert.Equal("The sign-in code expired. Try again.", e.Message);
    }

    [Fact]
    public async Task CancellingStopsThePoll()
    {
        using var cts = new CancellationTokenSource();
        var poll = GithubAuth.PollForTokenAsync(new HttpClient(new FakeGithub()), "client", Start, cts.Token, (span, ct) => Task.Delay(Timeout.Infinite, ct));

        cts.Cancel();

        var e = await Assert.ThrowsAsync<InvalidOperationException>(() => poll);
        Assert.Equal("Sign-in cancelled", e.Message);
    }

    [Fact]
    public async Task TheTokenIsStoredAndReadBackThroughTheSecretStore()
    {
        var store = new MemorySecretStore();

        Assert.Null(await GithubAuth.ReadTokenAsync(store));
        await GithubAuth.WriteTokenAsync(store, "gho_abc");
        Assert.Equal("gho_abc", await GithubAuth.ReadTokenAsync(store));
        await GithubAuth.DeleteTokenAsync(store);
        Assert.Null(await GithubAuth.ReadTokenAsync(store));
    }

    [Fact]
    public async Task ATokenIsRefusedRatherThanStoredInPlaintextWhenSecureStorageIsUnavailable()
    {
        var store = new MemorySecretStore { IsAvailable = false };

        var e = await Assert.ThrowsAsync<InvalidOperationException>(() => GithubAuth.WriteTokenAsync(store, "gho_abc"));

        Assert.Contains("Secure storage is not available", e.Message);
        Assert.Empty(store.Values);
        Assert.Null(await GithubAuth.ReadTokenAsync(store));
    }

    [Fact]
    public async Task AnUnreadableStoredTokenCountsAsNotConnectedInsteadOfThrowing()
    {
        Assert.Null(await GithubAuth.ReadTokenAsync(new ThrowingStore()));
    }

    private sealed class ThrowingStore : ISecretStore
    {
        public bool IsAvailable => true;
        public Task<string?> GetAsync(string key) => throw new System.Security.Cryptography.CryptographicException("blob from another user");
        public Task SetAsync(string key, string value) => Task.CompletedTask;
        public Task DeleteAsync(string key) => Task.CompletedTask;
    }
}
