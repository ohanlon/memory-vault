using System.Globalization;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;
using Cairn.Core.Markdown;
using Cairn.Core.Models;
using Cairn.Core.Shared;
using Cairn.Core.Yaml;

namespace Cairn.Core.Storage;

/// <summary>Port of electron/noteProperties.ts: frontmatter and body edited independently, each re-reading the file first.</summary>
public static class NoteProperties
{
    public static JsonObject ReadProperties(string absPath) => Matter.Parse(Files.ReadText(absPath)).Data;

    public static string ReadBody(string absPath) => Matter.Parse(Files.ReadText(absPath)).Content;

    /// <summary>Rewrites only the frontmatter block. An empty object removes the block entirely.</summary>
    public static void SaveProperties(string absPath, JsonObject properties)
    {
        var raw = File.Exists(absPath) ? Files.ReadText(absPath) : "";
        var content = Matter.Parse(raw).Content;
        // gray-matter's stringify merges the file's own data over {}, then the given properties on top.
        Files.WriteText(absPath, Matter.Stringify(content, properties));
    }

    /// <summary>Rewrites only the body, keeping whatever frontmatter is already on disk.</summary>
    public static void SaveBody(string absPath, string body)
    {
        var raw = File.Exists(absPath) ? Files.ReadText(absPath) : "";
        var data = Matter.Parse(raw).Data;
        Files.WriteText(absPath, data.Count > 0 ? Matter.Stringify(body, data) : body);
    }
}

/// <summary>Port of electron/propertiesSchema.ts: custom property definitions in &lt;root&gt;/.cairn/properties.yaml.</summary>
public static class PropertiesSchema
{
    private static readonly string[] PropertyTypes = { "text", "list", "number", "checkbox", "date", "datetime" };

    public static string FilePath(string root) => Path.Combine(root, ".cairn", "properties.yaml");

    public static JsonArray Read(string root)
    {
        var filePath = FilePath(root);
        if (!File.Exists(filePath)) return new JsonArray();
        try
        {
            var parsed = YamlLoader.Load(Files.ReadText(filePath));
            if (parsed is not JsonObject o || o["properties"] is not JsonArray props) return new JsonArray();
            var result = new JsonArray();
            foreach (var p in props)
                if (IsValidPropertyDef(p)) result.Add(p!.DeepClone());
            return result;
        }
        catch (Exception e) when (e is not OutOfMemoryException)
        {
            return new JsonArray();
        }
    }

    public static void Write(string root, JsonArray properties)
    {
        var filePath = FilePath(root);
        Files.EnsureParentDirectory(filePath);
        Files.WriteText(filePath, YamlDumper.SafeDump(new JsonObject { ["properties"] = properties.DeepClone() }));
    }

    private static bool IsValidPropertyDef(JsonNode? v) =>
        v is JsonObject o
        && Js.IsString(Js.Get(o, "name"), out var name) && name.Length > 0
        && Js.IsString(Js.Get(o, "type"), out var type) && Array.IndexOf(PropertyTypes, type) >= 0;
}

/// <summary>
/// Port of electron/noteHistory.ts: local version history kept under the user data dir (never inside a notes
/// folder). Snapshots are timestamped .md files keyed by a hash of the folder root plus the note's relative path.
/// </summary>
public static class NoteHistory
{
    private const double DefaultMinIntervalMs = 10 * 60 * 1000;
    private const int DefaultMaxSnapshots = 50;

    private static readonly Regex TimestampFileTail = new(@"T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z\z", RegexOptions.CultureInvariant);

    public sealed record Options(double? MinIntervalMs = null, int? MaxSnapshots = null, DateTime? Now = null, bool Force = false);

    private static string FolderKey(string folderRoot)
    {
        var resolved = Path.GetFullPath(folderRoot).TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar);
        if (resolved.Length == 2 && resolved[1] == ':') resolved += Path.DirectorySeparatorChar; // "C:" -> "C:\"
        if (resolved.Length == 0) resolved = Path.DirectorySeparatorChar.ToString();
        var normalized = OperatingSystem.IsWindows() ? resolved.ToLowerInvariant() : resolved;
        var hash = SHA1.HashData(Encoding.UTF8.GetBytes(normalized));
        return Convert.ToHexString(hash).ToLowerInvariant()[..16];
    }

    private static string SnapshotDir(string historyRoot, string folderRoot, string notePath) =>
        Path.Combine(historyRoot, FolderKey(folderRoot), notePath);

    // ISO 8601 with ":" and "." swapped for "-": valid on Windows and still lexically chronological.
    private static string TimestampToFileName(DateTime date) =>
        YamlDate.JsToIso(date).Replace(':', '-').Replace('.', '-') + ".md";

    private static string FileNameToTimestamp(string fileName)
    {
        var b = fileName.EndsWith(".md", StringComparison.Ordinal) ? fileName[..^3] : fileName;
        return TimestampFileTail.Replace(b, "T$1:$2:$3.$4Z");
    }

    private static List<string> ListSnapshotFiles(string dir)
    {
        if (!Directory.Exists(dir)) return new List<string>();
        var names = Directory.EnumerateFiles(dir).Select(Path.GetFileName).Where(f => f!.EndsWith(".md", StringComparison.Ordinal)).Select(f => f!).ToList();
        names.Sort(StringComparer.Ordinal);
        return names;
    }

    private static bool TryParseTimestamp(string text, out DateTime utc)
    {
        if (DateTimeOffset.TryParse(text, CultureInfo.InvariantCulture, DateTimeStyles.AssumeUniversal, out var dto))
        {
            utc = dto.UtcDateTime;
            return true;
        }
        utc = default;
        return false;
    }

    /// <summary>Records <paramref name="content"/> as a new snapshot, throttled so autosaves don't create one per keystroke.</summary>
    public static void Record(string historyRoot, string folderRoot, string notePath, string content, Options? options = null)
    {
        var minInterval = options?.MinIntervalMs ?? DefaultMinIntervalMs;
        var maxSnapshots = options?.MaxSnapshots ?? DefaultMaxSnapshots;
        var now = (options?.Now ?? DateTime.UtcNow).ToUniversalTime();

        var dir = SnapshotDir(historyRoot, folderRoot, notePath);
        var existing = ListSnapshotFiles(dir);

        if (options?.Force != true && existing.Count > 0
            && TryParseTimestamp(FileNameToTimestamp(existing[^1]), out var last)
            && (now - last).TotalMilliseconds < minInterval)
            return;

        Directory.CreateDirectory(dir);
        Files.WriteText(Path.Combine(dir, TimestampToFileName(now)), content);

        var updated = ListSnapshotFiles(dir);
        var excess = updated.Count - maxSnapshots;
        for (var i = 0; i < excess; i++) File.Delete(Path.Combine(dir, updated[i]));
    }

    /// <summary>Newest first.</summary>
    public static List<string> List(string historyRoot, string folderRoot, string notePath)
    {
        var files = ListSnapshotFiles(SnapshotDir(historyRoot, folderRoot, notePath));
        files.Reverse();
        return files.Select(FileNameToTimestamp).ToList();
    }

    public static string? Read(string historyRoot, string folderRoot, string notePath, string timestamp)
    {
        if (!TryParseTimestamp(timestamp, out var parsed)) return null;
        var fullPath = Path.Combine(SnapshotDir(historyRoot, folderRoot, notePath), TimestampToFileName(parsed));
        return File.Exists(fullPath) ? Files.ReadText(fullPath) : null;
    }
}

/// <summary>Port of electron/notesFolderCache.ts: the parsed-notes index kept at &lt;root&gt;/.cairn/index.json.</summary>
public static class NotesFolderCache
{
    public static string FilePath(string root) => Path.Combine(root, ".cairn", "index.json");

    public static List<Note>? Read(string root)
    {
        var filePath = FilePath(root);
        if (!File.Exists(filePath)) return null;
        try
        {
            if (JsonNode.Parse(Files.ReadText(filePath)) is not JsonObject o || o["notes"] is not JsonArray notes) return null;
            return notes.Select(n => n.Deserialize<Note>(CairnJson.Options)!).ToList();
        }
        catch (Exception e) when (e is System.Text.Json.JsonException or IOException or UnauthorizedAccessException or InvalidOperationException)
        {
            return null;
        }
    }

    public static void Write(string root, IEnumerable<Note> notes)
    {
        var filePath = FilePath(root);
        Files.EnsureParentDirectory(filePath);
        var node = new JsonObject { ["notes"] = CairnJson.ToNode(notes.ToList()) };
        Files.WriteText(filePath, Files.Compact(node));
    }
}
