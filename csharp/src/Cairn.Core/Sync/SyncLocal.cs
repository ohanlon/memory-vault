using System.Collections.Concurrent;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;

namespace Cairn.Core.Sync;

public sealed record SyncChange(string Path, string State);

/// <summary>What the folder looked like when it last matched GitHub: the commit and each file's git blob sha.</summary>
public sealed class SyncState(string repo, string branch)
{
    public string Repo { get; } = repo;
    public string Branch { get; } = branch;
    public string? Head { get; set; }
    public Dictionary<string, string> Files { get; } = new(StringComparer.Ordinal);
}

/// <summary>
/// The local half of sync. Without a .git folder (the C# builds don't create one), "what changed" is answered by
/// comparing each file's git blob sha with the snapshot recorded at the last sync.
/// </summary>
public static class SyncLocal
{
    public const string DefaultIgnore = ".DS_Store\nThumbs.db\n.cairn/\n";
    private const string StateFile = ".cairn/sync-state.json";

    // path -> (length, mtime) -> sha, so repeated status checks don't re-read every unchanged file.
    private static readonly ConcurrentDictionary<string, (long Length, long Ticks, string Sha)> ShaCache = new();

    /// <summary>The sha git gives a file's contents (<c>git hash-object</c>): SHA-1 over "blob &lt;length&gt;\0" + bytes.</summary>
    public static string BlobSha(byte[] content)
    {
        using var hash = IncrementalHash.CreateHash(HashAlgorithmName.SHA1);
        hash.AppendData(Encoding.ASCII.GetBytes($"blob {content.Length}\0"));
        hash.AppendData(content);
        return Convert.ToHexString(hash.GetHashAndReset()).ToLowerInvariant();
    }

    /// <summary>Cairn's own folders are never notes, and git's own can't be synced.</summary>
    public static bool IsInternalPath(string path) =>
        path is ".cairn" or ".git" || path.StartsWith(".cairn/", StringComparison.Ordinal) || path.StartsWith(".git/", StringComparison.Ordinal);

    /// <summary>A repository path that is safe to write under the folder root (no "..", no rooted or backslashed parts, no .git).</summary>
    public static bool IsSafeRelativePath(string path)
    {
        if (path.Length == 0 || path.StartsWith('/') || path.Contains('\\') || path.Contains('\0')) return false;
        return path.Split('/').All(s => s.Length > 0 && s != "." && s != ".." && !s.Equals(".git", StringComparison.OrdinalIgnoreCase));
    }

    // ---- ignore rules ----------------------------------------------------------------------------------

    /// <summary>
    /// A deliberately small subset of .gitignore: blank lines and comments are skipped, "dir/" matches a directory
    /// anywhere, a pattern with a slash is anchored at the root, and otherwise it matches any path segment. "*", "?"
    /// work; "!" negation and "**" are not supported (negation lines are ignored).
    /// </summary>
    public static Func<string, bool> LoadIgnore(string root)
    {
        var text = DefaultIgnore;
        var file = Path.Combine(root, ".gitignore");
        if (File.Exists(file)) text += "\n" + File.ReadAllText(file);

        var matchers = new List<Func<string, bool>>();
        foreach (var raw in text.Split('\n'))
        {
            var line = raw.Trim();
            if (line.Length == 0 || line.StartsWith('#') || line.StartsWith('!')) continue;

            var dirOnly = line.EndsWith('/');
            var pattern = line.Trim('/');
            if (pattern.Length == 0) continue;
            var regex = new Regex("^" + Regex.Escape(pattern).Replace("\\*", "[^/]*").Replace("\\?", "[^/]") + "$", RegexOptions.CultureInvariant);

            if (line.TrimEnd('/').Contains('/'))
                matchers.Add(p => regex.IsMatch(p) || p.StartsWith(pattern + "/", StringComparison.Ordinal));
            else
                matchers.Add(p =>
                {
                    var segments = p.Split('/');
                    for (var i = 0; i < segments.Length; i++)
                    {
                        if (dirOnly && i == segments.Length - 1) continue; // a directory pattern never matches the file itself
                        if (regex.IsMatch(segments[i])) return true;
                    }
                    return false;
                });
        }
        return p => matchers.Any(m => m(p));
    }

    // ---- scanning --------------------------------------------------------------------------------------

    /// <summary>Every syncable file under <paramref name="root"/> as forward-slashed relative path -> git blob sha.</summary>
    public static Dictionary<string, string> Scan(string root)
    {
        var result = new Dictionary<string, string>(StringComparer.Ordinal);
        var ignored = LoadIgnore(root);
        if (Directory.Exists(root)) Walk(root, "", ignored, result);
        return result;
    }

    private static void Walk(string dir, string prefix, Func<string, bool> ignored, Dictionary<string, string> into)
    {
        foreach (var entry in new DirectoryInfo(dir).EnumerateFileSystemInfos())
        {
            if (entry.Attributes.HasFlag(FileAttributes.ReparsePoint)) continue; // symlinks and junctions aren't synced
            var rel = prefix + entry.Name;
            if (IsInternalPath(rel) || ignored(rel)) continue;

            if (entry is DirectoryInfo sub)
            {
                Walk(sub.FullName, rel + "/", ignored, into);
                continue;
            }
            var file = (FileInfo)entry;
            var key = file.FullName;
            var ticks = file.LastWriteTimeUtc.Ticks;
            if (ShaCache.TryGetValue(key, out var cached) && cached.Length == file.Length && cached.Ticks == ticks)
            {
                into[rel] = cached.Sha;
                continue;
            }
            var sha = BlobSha(File.ReadAllBytes(key));
            ShaCache[key] = (file.Length, ticks, sha);
            into[rel] = sha;
        }
    }

    /// <summary>Files that differ from the last sync, for the plugin to list (no Cairn internals).</summary>
    public static List<SyncChange> ListChanges(string root, SyncState? state, IReadOnlyDictionary<string, string>? scanned = null)
    {
        var local = scanned ?? Scan(root);
        var ignored = LoadIgnore(root);
        var snapshot = state?.Files ?? new Dictionary<string, string>();
        var changes = new List<SyncChange>();

        foreach (var (path, sha) in local)
        {
            if (!snapshot.TryGetValue(path, out var known)) changes.Add(new SyncChange(path, "added"));
            else if (known != sha) changes.Add(new SyncChange(path, "modified"));
        }
        foreach (var path in snapshot.Keys)
            if (!local.ContainsKey(path) && !ignored(path) && !IsInternalPath(path)) changes.Add(new SyncChange(path, "deleted"));

        changes.Sort((a, b) => string.CompareOrdinal(a.Path, b.Path));
        return changes;
    }

    // ---- state file ------------------------------------------------------------------------------------

    /// <summary>The saved snapshot, or null if there is none, it is unreadable, or it belongs to a different repo/branch.</summary>
    public static SyncState? ReadState(string root, string repo, string branch)
    {
        try
        {
            var file = Path.Combine(root, StateFile);
            if (!File.Exists(file) || JsonNode.Parse(File.ReadAllText(file)) is not JsonObject json) return null;
            if (json["repo"]?.ToString() != repo || json["branch"]?.ToString() != branch) return null;

            var state = new SyncState(repo, branch) { Head = json["head"]?.ToString() };
            if (json["files"] is JsonObject files)
                foreach (var (path, sha) in files)
                    if (sha?.ToString() is { Length: > 0 } s) state.Files[path] = s;
            return state;
        }
        catch (Exception e) when (e is System.Text.Json.JsonException or IOException or UnauthorizedAccessException)
        {
            return null;
        }
    }

    public static void WriteState(string root, SyncState state)
    {
        var files = new JsonObject();
        foreach (var (path, sha) in state.Files.OrderBy(kv => kv.Key, StringComparer.Ordinal)) files[path] = sha;
        var json = new JsonObject
        {
            ["repo"] = state.Repo,
            ["branch"] = state.Branch,
            ["head"] = state.Head,
            ["files"] = files,
        };
        var file = Path.Combine(root, StateFile);
        Directory.CreateDirectory(Path.GetDirectoryName(file)!);
        File.WriteAllText(file, json.ToJsonString(new System.Text.Json.JsonSerializerOptions { WriteIndented = true }));
    }
}
