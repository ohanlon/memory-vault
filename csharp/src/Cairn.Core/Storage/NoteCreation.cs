using System.Text.Json.Nodes;
using System.Text.RegularExpressions;
using Cairn.Core.Markdown;
using Cairn.Core.Shared;

namespace Cairn.Core.Storage;

public sealed record DailyNoteResult(string Path, bool Created);

/// <summary>Port of electron/dailyNote.ts.</summary>
public static class DailyNotes
{
    /// <summary>Fixed, notes-folder-relative folder every daily note lives in (shared/dailyNote.ts).</summary>
    public const string FolderName = "daily";

    // Characters invalid in a filename on at least one major OS become "-", so a date pattern with a time
    // separator (":") can't turn into a broken/nested path.
    private static string SanitizeFilenamePart(string s) => Regex.Replace(s, @"[\\/:*?""<>|]", "-");

    /// <summary>Opens today's daily note, creating it (and its folder) on first use.</summary>
    public static DailyNoteResult OpenOrCreate(string root, string dateFormat, DateTime now)
    {
        var folderAbs = Path.Combine(root, FolderName);
        var formatted = DateFormat.Format(now, dateFormat);
        var fullPath = Path.Combine(folderAbs, $"{SanitizeFilenamePart(formatted)}.md");

        if (File.Exists(fullPath)) return new DailyNoteResult(fullPath, false);

        Directory.CreateDirectory(folderAbs);
        Files.WriteText(fullPath, $"---\ntags: []\n---\n# {formatted}\n");
        return new DailyNoteResult(fullPath, true);
    }
}

/// <summary>Port of electron/tasks.ts and the constants of shared/tasks.ts.</summary>
public static class Tasks
{
    public const string FolderName = "Tasks";
    public static readonly string[] Statuses = { "todo", "in-progress", "done" };
    private const int MaxFileTitleLength = 80;

    /// <summary>The existing top-level tasks folder (matched case-insensitively), or where a new one would go.</summary>
    public static string ResolveFolder(string root)
    {
        var existing = new DirectoryInfo(root).EnumerateDirectories()
            .FirstOrDefault(d => d.Name.ToLowerInvariant() == FolderName.ToLowerInvariant());
        return Path.Combine(root, existing?.Name ?? FolderName);
    }

    // The action text becomes the file name, so characters invalid on any supported OS become "-".
    private static string FileTitleFor(string text)
    {
        var cleaned = Regex.Replace(text, @"[\\/:*?""<>|\x00-\x1f]", "-");
        cleaned = Regex.Replace(cleaned, @"\s+", " ").Trim();
        if (cleaned.Length > MaxFileTitleLength) cleaned = cleaned[..MaxFileTitleLength];
        cleaned = Regex.Replace(cleaned, @"[. ]+\z", "");
        return cleaned.Length > 0 ? cleaned : "Task";
    }

    private static readonly Regex DeadlineRe = new(@"^[0-9]{4}-[0-9]{2}-[0-9]{2}\z", RegexOptions.CultureInvariant);

    /// <summary>Creates a task as its own note in the tasks folder, with status/deadline as frontmatter. Returns the note's path.</summary>
    public static string CreateNote(string root, string text, string? deadline, string status)
    {
        var action = text.Trim();
        if (action.Length == 0) throw new InvalidOperationException("A task needs an action");
        if (Array.IndexOf(Statuses, status) < 0) throw new InvalidOperationException($"Unknown task status \"{status}\"");
        if (deadline is not null && !DeadlineRe.IsMatch(deadline)) throw new InvalidOperationException($"Invalid deadline \"{deadline}\"");

        var dir = ResolveFolder(root);
        Directory.CreateDirectory(dir);
        var fullPath = NotesFolderFs.UniqueNotePath(dir, FileTitleFor(action));
        var properties = new JsonObject { ["status"] = status };
        if (!string.IsNullOrEmpty(deadline)) properties["deadline"] = deadline;
        Files.WriteText(fullPath, Matter.Stringify($"# {action}\n", properties));
        return fullPath;
    }
}

/// <summary>Port of electron/attachments.ts and shared/attachmentPath.ts: files pasted/dropped into notes.</summary>
public static class Attachments
{
    public const string DirName = "attachments";
    public const string Scheme = "cairn-attachment";

    // Like Node's path.extname: a leading dot (".gitignore") isn't an extension separator.
    private static string ExtName(string fileName)
    {
        var dot = fileName.LastIndexOf('.');
        return dot <= 0 ? "" : fileName[dot..];
    }

    private static string UniquePath(string dir, string fileName)
    {
        var ext = ExtName(fileName);
        var baseName = ext.Length > 0 ? fileName[..^ext.Length] : fileName;
        var candidate = fileName;
        var n = 0;
        while (File.Exists(Path.Combine(dir, candidate)) || Directory.Exists(Path.Combine(dir, candidate)))
        {
            n++;
            candidate = $"{baseName} {n}{ext}";
        }
        return Path.Combine(dir, candidate);
    }

    /// <summary>Saves under the root's "attachments" folder, renaming on a collision. Returns the path relative to root, posix-separated.</summary>
    public static string Save(string root, string fileName, byte[] data)
    {
        var dir = Path.Combine(root, DirName);
        Directory.CreateDirectory(dir);
        var fullPath = UniquePath(dir, fileName);
        if (!IsWithin(dir, fullPath)) throw new InvalidOperationException("Attachment name escapes the attachments folder");
        File.WriteAllBytes(fullPath, data);
        return Path.GetRelativePath(root, fullPath).Replace('\\', '/');
    }

    private static bool IsWithin(string dir, string path)
    {
        var rel = Path.GetRelativePath(Path.GetFullPath(dir), Path.GetFullPath(path));
        return !rel.StartsWith("..", StringComparison.Ordinal) && !Path.IsPathRooted(rel);
    }

    private static void WalkFiles(string root, string dir, List<string> output)
    {
        if (!Directory.Exists(dir)) return;
        foreach (var entry in new DirectoryInfo(dir).EnumerateFileSystemInfos())
        {
            if (entry.LinkTarget is not null) continue;
            if (entry is DirectoryInfo) WalkFiles(root, entry.FullName, output);
            else output.Add(Path.GetRelativePath(root, entry.FullName).Replace('\\', '/'));
        }
    }

    private static readonly Regex UrlScheme = new(@"^[a-z][a-z0-9+.-]*:", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant);

    /// <summary>
    /// Resolves an image href against its note's own directory into a root-relative, posix-separated path; null if the
    /// href has its own URL scheme, is an in-page anchor, or resolves outside the root.
    /// </summary>
    public static string? ResolveRelativePath(string noteRelativePath, string href)
    {
        if (href.Length == 0 || href.StartsWith('#') || UrlScheme.IsMatch(href)) return null;

        var withoutFragment = href.Split('#')[0];
        var noteDirParts = noteRelativePath.Replace('\\', '/').Split('/').SkipLast(1);
        var decoded = JsUri.TryDecodeComponent(withoutFragment)
            ?? throw new InvalidOperationException("URI malformed");
        var hrefParts = decoded.Replace('\\', '/').Split('/');

        var stack = new List<string>(noteDirParts);
        foreach (var part in hrefParts)
        {
            if (part.Length == 0 || part == ".") continue;
            if (part == "..")
            {
                if (stack.Count == 0) return null;
                stack.RemoveAt(stack.Count - 1);
                continue;
            }
            stack.Add(part);
        }
        return string.Join('/', stack);
    }

    /// <summary>Every attachment file no note's image embed refers to.</summary>
    public static List<string> FindOrphaned(string root, IEnumerable<Models.Note> notes)
    {
        var referenced = new HashSet<string>(StringComparer.Ordinal);
        foreach (var note in notes)
            foreach (var href in NoteLinks.ExtractImageEmbeds(note.Content))
            {
                var resolved = ResolveRelativePath(note.RelativePath, href);
                if (resolved is not null) referenced.Add(resolved);
            }

        var all = new List<string>();
        WalkFiles(root, Path.Combine(root, DirName), all);
        return all.Where(p => !referenced.Contains(p)).ToList();
    }

    /// <summary>Deletes the given root-relative paths, skipping missing files and anything that would escape the root.</summary>
    public static void Delete(string root, IEnumerable<string> relativePaths)
    {
        var resolvedRoot = Path.GetFullPath(root);
        foreach (var relPath in relativePaths)
        {
            var fullPath = Path.GetFullPath(Path.Combine(resolvedRoot, relPath));
            if (!IsWithin(resolvedRoot, fullPath) || string.Equals(fullPath, resolvedRoot, StringComparison.Ordinal)) continue;
            if (File.Exists(fullPath)) File.Delete(fullPath);
        }
    }

    /// <summary>Resolves a request path against the root, refusing anything that escapes it (cairn-attachment:// requests).</summary>
    public static string? ResolveFilePath(string root, string requestPathname)
    {
        var decoded = JsUri.TryDecodeComponent(requestPathname) ?? throw new InvalidOperationException("URI malformed");
        decoded = decoded.TrimStart('/');
        var resolvedRoot = Path.GetFullPath(root);
        var resolved = Path.GetFullPath(Path.Combine(resolvedRoot, decoded));
        return IsWithin(resolvedRoot, resolved) ? resolved : null;
    }

    private static readonly Dictionary<string, string> MimeTypes = new(StringComparer.OrdinalIgnoreCase)
    {
        [".html"] = "text/html", [".htm"] = "text/html", [".js"] = "text/javascript", [".mjs"] = "text/javascript",
        [".css"] = "text/css", [".json"] = "application/json", [".png"] = "image/png", [".jpg"] = "image/jpeg",
        [".jpeg"] = "image/jpeg", [".svg"] = "image/svg+xml", [".gif"] = "image/gif",
    };

    /// <summary>The MIME map from electron/pluginProtocol.ts (<c>contentTypeFor</c>), shared by attachments and plugins.</summary>
    public static string ContentTypeFor(string filePath) =>
        MimeTypes.TryGetValue(Path.GetExtension(filePath), out var t) ? t : "application/octet-stream";

    /// <summary>root-relative path -> data: URL for every path that could be read; missing/unreadable paths are omitted.</summary>
    public static Dictionary<string, string> ReadManyAsDataUrls(string root, IEnumerable<string> rootRelativePaths)
    {
        var result = new Dictionary<string, string>();
        foreach (var relPath in rootRelativePaths)
        {
            var fullPath = ResolveFilePath(root, "/" + relPath);
            if (fullPath is null || !File.Exists(fullPath)) continue;
            try
            {
                result[relPath] = $"data:{ContentTypeFor(fullPath)};base64,{Convert.ToBase64String(File.ReadAllBytes(fullPath))}";
            }
            catch (Exception e) when (e is IOException or UnauthorizedAccessException)
            {
                // best-effort inlining
            }
        }
        return result;
    }
}
