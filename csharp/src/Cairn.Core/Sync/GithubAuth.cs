using System.Net.Http.Json;
using System.Text.Json.Nodes;

namespace Cairn.Core.Sync;

/// <summary>
/// Where the GitHub token is kept. Each host supplies an OS-backed implementation (DPAPI on Windows, the Keystore on
/// Android); a host without one reports <see cref="IsAvailable"/> == false and the token is refused rather than stored
/// in plaintext, matching what electron/githubAuth.ts does when safeStorage is unavailable.
/// </summary>
public interface ISecretStore
{
    bool IsAvailable { get; }
    Task<string?> GetAsync(string key);
    Task SetAsync(string key, string value);
    Task DeleteAsync(string key);
}

public sealed record DeviceFlowStart(string DeviceCode, string UserCode, string VerificationUri, int Interval, int ExpiresIn);

/// <summary>Port of electron/githubAuth.ts: GitHub's OAuth device flow and the saved token.</summary>
public static class GithubAuth
{
    /// <summary>Public client ID of Cairn's GitHub OAuth App (shared/githubConfig.ts). Device flow needs no client secret.</summary>
    public const string ClientId = "Ov23liUJRhZRwbgyy7ZH";

    public const string TokenKey = "github-token";

    public static async Task<DeviceFlowStart> StartDeviceFlowAsync(HttpClient http, string clientId)
    {
        if (string.IsNullOrEmpty(clientId) || clientId.StartsWith("REPLACE_", StringComparison.Ordinal))
            throw new InvalidOperationException("GitHub sign-in isn't configured: set GITHUB_CLIENT_ID in shared/githubConfig.ts.");

        using var response = await PostJsonAsync(http, "https://github.com/login/device/code",
            new JsonObject { ["client_id"] = clientId, ["scope"] = "repo" });
        var body = JsonNode.Parse(await response.Content.ReadAsStringAsync()) as JsonObject;
        if (!response.IsSuccessStatusCode || body?["device_code"] is not JsonValue code || !code.TryGetValue<string>(out var deviceCode))
            throw new InvalidOperationException(
                body?["error_description"]?.ToString() ?? body?["error"]?.ToString() ?? $"GitHub returned {(int)response.StatusCode}");

        return new DeviceFlowStart(
            deviceCode,
            body["user_code"]?.ToString() ?? "",
            body["verification_uri"]?.ToString() ?? "",
            body["interval"]?.GetValue<int>() ?? 5,
            body["expires_in"]?.GetValue<int>() ?? 900);
    }

    /// <summary>
    /// Polls until the user authorises (returns the access token) or the flow fails, expires or is cancelled (throws).
    /// Honours GitHub's slow_down back-off. <paramref name="delay"/> and <paramref name="now"/> exist so tests don't wait.
    /// </summary>
    public static async Task<string> PollForTokenAsync(
        HttpClient http, string clientId, DeviceFlowStart start, CancellationToken cancellation,
        Func<TimeSpan, CancellationToken, Task>? delay = null, Func<DateTimeOffset>? now = null)
    {
        delay ??= (span, ct) => Task.Delay(span, ct);
        now ??= () => DateTimeOffset.UtcNow;
        var deadline = now() + TimeSpan.FromSeconds(start.ExpiresIn);
        var interval = start.Interval;

        while (now() < deadline)
        {
            try { await delay(TimeSpan.FromSeconds(interval), cancellation); }
            catch (OperationCanceledException) { throw new InvalidOperationException("Sign-in cancelled"); }
            cancellation.ThrowIfCancellationRequested();

            using var response = await PostJsonAsync(http, "https://github.com/login/oauth/access_token", new JsonObject
            {
                ["client_id"] = clientId,
                ["device_code"] = start.DeviceCode,
                ["grant_type"] = "urn:ietf:params:oauth:grant-type:device_code",
            });
            var body = JsonNode.Parse(await response.Content.ReadAsStringAsync()) as JsonObject;
            if (body?["access_token"] is JsonValue token && token.TryGetValue<string>(out var accessToken)) return accessToken;

            switch (body?["error"]?.ToString())
            {
                case "authorization_pending":
                    break;
                case "slow_down":
                    interval = body["interval"]?.GetValue<int>() ?? interval + 5;
                    break;
                case "expired_token":
                    throw new InvalidOperationException("The sign-in code expired. Try again.");
                case "access_denied":
                    throw new InvalidOperationException("Authorisation was denied.");
                default:
                    throw new InvalidOperationException(body?["error_description"]?.ToString() ?? body?["error"]?.ToString() ?? "Sign-in failed");
            }
        }
        throw new InvalidOperationException("The sign-in code expired. Try again.");
    }

    private static Task<HttpResponseMessage> PostJsonAsync(HttpClient http, string url, JsonNode body)
    {
        var request = new HttpRequestMessage(HttpMethod.Post, url) { Content = JsonContent.Create(body) };
        request.Headers.Accept.ParseAdd("application/json");
        request.Headers.UserAgent.ParseAdd("Cairn");
        return http.SendAsync(request);
    }

    // ---- saved token -----------------------------------------------------------------------------------

    public static async Task WriteTokenAsync(ISecretStore store, string token)
    {
        // Refuse rather than fall back to plaintext.
        if (!store.IsAvailable) throw new InvalidOperationException("Secure storage is not available on this system");
        await store.SetAsync(TokenKey, token);
    }

    /// <summary>The saved token, or null if there is none or it can't be read (never throws, like readToken).</summary>
    public static async Task<string?> ReadTokenAsync(ISecretStore store)
    {
        try { return store.IsAvailable ? await store.GetAsync(TokenKey) : null; }
        catch (Exception e) when (e is not OperationCanceledException) { return null; }
    }

    public static Task DeleteTokenAsync(ISecretStore store) => store.DeleteAsync(TokenKey);
}
