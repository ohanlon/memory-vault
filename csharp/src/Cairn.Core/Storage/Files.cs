using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using Cairn.Core.Yaml;

namespace Cairn.Core.Storage;

/// <summary>File helpers that reproduce Node's <c>fs</c> behavior: UTF-8 without BOM handling, and "\n" line endings in written JSON.</summary>
public static class Files
{
    private static readonly UTF8Encoding Utf8 = new(encoderShouldEmitUTF8Identifier: false);
    private static readonly DateTime Epoch = new(1970, 1, 1, 0, 0, 0, DateTimeKind.Utc);

    /// <summary>Like <c>fs.readFileSync(path, "utf-8")</c>: a leading BOM is kept as U+FEFF (File.ReadAllText would strip it).</summary>
    public static string ReadText(string path) => Utf8.GetString(File.ReadAllBytes(path));

    public static async Task<string> ReadTextAsync(string path) => Utf8.GetString(await File.ReadAllBytesAsync(path));

    public static void WriteText(string path, string content) => File.WriteAllBytes(path, Utf8.GetBytes(content));

    public static async Task WriteTextAsync(string path, string content) =>
        await File.WriteAllBytesAsync(path, Utf8.GetBytes(content));

    public static void EnsureParentDirectory(string filePath)
    {
        var dir = Path.GetDirectoryName(filePath);
        if (!string.IsNullOrEmpty(dir)) Directory.CreateDirectory(dir);
    }

    /// <summary>Like <c>fs.statSync(path).mtimeMs</c>.</summary>
    public static double MtimeMs(string path) => ToMs(File.GetLastWriteTimeUtc(path));

    public static double ToMs(DateTime utc) => (utc.Ticks - Epoch.Ticks) / 10000.0;

    /// <summary>Reads a JSON file; null when missing or unparseable (every settings file in Cairn degrades to defaults).</summary>
    public static JsonNode? TryReadJson(string path)
    {
        if (!File.Exists(path)) return null;
        try
        {
            return JsonNode.Parse(ReadText(path));
        }
        catch (Exception e) when (e is JsonException or IOException or UnauthorizedAccessException)
        {
            return null;
        }
    }

    /// <summary><c>JSON.stringify(value, null, 2)</c> to a file, creating the parent directory.</summary>
    public static void WriteJsonIndented(string path, JsonNode? value)
    {
        EnsureParentDirectory(path);
        WriteText(path, Indented(value));
    }

    /// <summary><c>JSON.stringify(value)</c> to a file, creating the parent directory.</summary>
    public static void WriteJsonCompact(string path, JsonNode? value)
    {
        EnsureParentDirectory(path);
        WriteText(path, Compact(value));
    }

    public static string Indented(JsonNode? value) =>
        (value is null ? "null" : YamlDate.Flatten(value)!.ToJsonString(IndentedOptions)).Replace("\r\n", "\n");

    public static string Compact(JsonNode? value) =>
        value is null ? "null" : YamlDate.Flatten(value)!.ToJsonString(CompactOptions);

    private static readonly JsonSerializerOptions IndentedOptions = new(CairnJson.NodeOptions) { WriteIndented = true };
    private static readonly JsonSerializerOptions CompactOptions = CairnJson.NodeOptions;
}

/// <summary>Where Cairn keeps its per-user files. Shares Electron's <c>userData</c> location, so both builds see the same settings.</summary>
public static class UserDataDir
{
    public const string OverrideVariable = "CAIRN_USER_DATA_DIR";

    /// <summary>Mirrors Electron's default <c>app.getPath("userData")</c> for an app named "cairn" (see electron/userDataDir.ts).</summary>
    public static string Resolve()
    {
        var overridden = Environment.GetEnvironmentVariable(OverrideVariable);
        if (!string.IsNullOrWhiteSpace(overridden)) return Path.GetFullPath(overridden);

        const string appName = "cairn";
        var home = Environment.GetFolderPath(Environment.SpecialFolder.UserProfile);
        if (OperatingSystem.IsWindows())
        {
            var appData = Environment.GetEnvironmentVariable("APPDATA");
            return Path.Combine(string.IsNullOrEmpty(appData) ? Path.Combine(home, "AppData", "Roaming") : appData, appName);
        }
        if (OperatingSystem.IsMacOS()) return Path.Combine(home, "Library", "Application Support", appName);
        var configHome = Environment.GetEnvironmentVariable("XDG_CONFIG_HOME");
        return Path.Combine(string.IsNullOrEmpty(configHome) ? Path.Combine(home, ".config") : configHome, appName);
    }
}

/// <summary>The files under the user data directory, named exactly as in electron/main.ts.</summary>
public sealed class CairnPaths
{
    public CairnPaths(string userDataDir) => UserData = userDataDir;

    public string UserData { get; }
    public string NotesFolders => Path.Combine(UserData, "notesFolders.json");
    public string CliAccess => Path.Combine(UserData, "cli-access.json");
    public string GithubToken => Path.Combine(UserData, "github-auth.bin");
    public string SyncConfig => Path.Combine(UserData, "sync-config.json");
    public string History => Path.Combine(UserData, "history");
    public string LayoutPrefs => Path.Combine(UserData, "layout-prefs.json");
    public string VoiceModels => Path.Combine(UserData, "voice-models");
    public string AppSettings => Path.Combine(UserData, "settings.json");
    public string PluginPermissions => Path.Combine(UserData, "plugin-permissions.json");
    public string Plugins => Path.Combine(UserData, "plugins");
    public string PluginState => Path.Combine(UserData, "plugin-state.json");
}
