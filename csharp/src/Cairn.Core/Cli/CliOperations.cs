using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;
using Cairn.Core.Markdown;
using Cairn.Core.Models;
using Cairn.Core.Shared;
using Cairn.Core.Storage;
using Cairn.Core.Yaml;

namespace Cairn.Core.Cli;

public sealed record SearchNotesOptions(bool Regex = false, bool CaseSensitive = false, bool WholeWord = false);

/// <summary>
/// Port of the operations in electron/cli.ts, shared by the command line and the MCP server. Results are
/// <see cref="JsonObject"/>s with the same keys, in the same order, as the TypeScript ones, so the two builds print
/// identical JSON. Every operation goes through <see cref="ResolveFolder"/>, so a folder that hasn't been granted
/// CLI/MCP access (see <see cref="CliAccess"/>) is unreachable from either entry point.
/// </summary>
public sealed class CliOperations(CairnPaths paths)
{
    private static JsonObject Fail(string message) => new() { ["ok"] = false, ["message"] = message };

    private static JsonObject MissingNote(string notePath, string folder) =>
        Fail($"Note \"{notePath}\" does not exist in notes folder \"{folder}\".");

    private List<JsonObject> Registry() => NotesFolderRegistry.Read(paths.NotesFolders, paths.NotesRoot);

    private JsonObject ResolveFolder(string name)
    {
        var folders = Registry();
        var entry = NotesFolderRegistry.FindByNameCI(folders, name);
        if (entry is null)
        {
            var known = folders.Count == 0 ? "(none)" : string.Join(", ", folders.Select(NotesFolderRegistry.NameOf));
            throw new InvalidOperationException($"No notes folder named \"{name}\". Known notes folders: {known}");
        }
        if (!CliAccess.IsAllowed(CliAccess.Read(paths.CliAccess), NotesFolderRegistry.NameOf(entry)))
            throw new InvalidOperationException(
                $"CLI/MCP access to notes folder \"{NotesFolderRegistry.NameOf(entry)}\" has not been granted. Enable it from that folder's \"...\" menu in Cairn (\"Allow CLI/MCP access\").");
        return entry;
    }

    // path.join(root, notePath): a leading separator in notePath does not make it absolute.
    private static string Join(string root, string notePath) =>
        Path.GetFullPath(Path.Combine(root, notePath.TrimStart('/', '\\')));

    private static void EnsureInside(string root, string target)
    {
        var rel = Path.GetRelativePath(root, target);
        if (rel.StartsWith("..", StringComparison.Ordinal) || Path.IsPathRooted(rel))
            throw new InvalidOperationException("Path escapes the notes folder");
    }

    // The folder entry plus the absolute note path (checked to be inside the folder) and its normalized path relative
    // to the folder, which is what the history store is keyed by.
    private (string Name, string Root, string FullPath, string Rel) ResolveNote(string folderName, string notePath)
    {
        var entry = ResolveFolder(folderName);
        var root = NotesFolderRegistry.RootOf(entry);
        var fullPath = Join(root, notePath);
        EnsureInside(root, fullPath);
        return (NotesFolderRegistry.NameOf(entry), root, fullPath, Path.GetRelativePath(root, fullPath));
    }

    // Optimistic concurrency: a write that would clobber a change made since the caller's read is refused.
    private static JsonObject? CheckExpectedMtime(string fullPath, double? expected)
    {
        if (expected is null) return null;
        var current = Files.MtimeMs(fullPath);
        if (current == expected) return null;
        return new JsonObject
        {
            ["ok"] = false,
            ["conflict"] = true,
            ["message"] = $"Note has changed since it was last read (expected mtime {JsNumber.ToString(expected.Value)}, found {JsNumber.ToString(current)}). Re-fetch and retry.",
            ["currentMtimeMs"] = current,
        };
    }

    private static string UniqueFolderName(List<JsonObject> folders, string baseName)
    {
        if (NotesFolderRegistry.FindByNameCI(folders, baseName) is null) return baseName;
        var n = 1;
        string candidate;
        do { n++; candidate = $"{baseName} {n}"; }
        while (NotesFolderRegistry.FindByNameCI(folders, candidate) is not null);
        return candidate;
    }

    private static bool SameRoot(string a, string b)
    {
        string Normalize(string p) => OperatingSystem.IsWindows() ? Path.GetFullPath(p).ToLowerInvariant() : Path.GetFullPath(p);
        return Normalize(a) == Normalize(b);
    }

    // Registering a brand-new folder grants it CLI/MCP access (the caller already has access by definition); an
    // already-registered one is deliberately not granted, so a caller can't give itself access by re-adding its path.
    public JsonObject AddFolder(string root, string? requestedName = null)
    {
        var folders = Registry();
        var resolvedRoot = Path.GetFullPath(root);

        var existing = folders.FirstOrDefault(f => SameRoot(NotesFolderRegistry.RootOf(f), resolvedRoot));
        if (existing is not null)
            return new JsonObject
            {
                ["ok"] = true,
                ["alreadyExists"] = true,
                ["name"] = NotesFolderRegistry.NameOf(existing),
                ["root"] = NotesFolderRegistry.RootOf(existing),
                ["message"] = $"\"{resolvedRoot}\" is already a notes folder, named \"{NotesFolderRegistry.NameOf(existing)}\".",
            };

        Directory.CreateDirectory(resolvedRoot);

        var desired = (requestedName ?? Path.GetFileName(resolvedRoot.TrimEnd('/', '\\'))).Trim();
        if (desired.Length == 0) desired = "Untitled";
        var finalName = UniqueFolderName(folders, desired);
        NotesFolderRegistry.Write(paths.NotesFolders, NotesFolderRegistry.Add(folders, finalName, resolvedRoot));
        CliAccess.Write(paths.CliAccess, CliAccess.Allow(CliAccess.Read(paths.CliAccess), finalName));

        var renamed = finalName != desired;
        return new JsonObject
        {
            ["ok"] = true,
            ["alreadyExists"] = false,
            ["renamed"] = renamed,
            ["name"] = finalName,
            ["root"] = resolvedRoot,
            ["message"] = renamed
                ? $"Created notes folder \"{finalName}\" (name \"{desired}\" was already in use)."
                : $"Created notes folder \"{finalName}\".",
        };
    }

    public JsonObject GetNotes(string folderName, bool includeSubfolders)
    {
        var entry = ResolveFolder(folderName);
        var root = NotesFolderRegistry.RootOf(entry);

        IEnumerable<string> notes = includeSubfolders
            ? NotesFolderFs.ListMarkdownFiles(root).Select(f => Path.GetRelativePath(root, f))
            : new DirectoryInfo(root).EnumerateFileSystemInfos()
                .Where(e => e is FileInfo && e.LinkTarget is null && !e.Name.StartsWith('.') && e.Name.EndsWith(".md", StringComparison.OrdinalIgnoreCase))
                .Select(e => e.Name);

        return new JsonObject
        {
            ["ok"] = true,
            ["folder"] = NotesFolderRegistry.NameOf(entry),
            ["subfolders"] = includeSubfolders,
            ["notes"] = new JsonArray(notes.Select(n => (JsonNode)n).ToArray()),
        };
    }

    public JsonObject GetNote(string folderName, string notePath)
    {
        var (name, _, fullPath, _) = ResolveNote(folderName, notePath);
        if (!File.Exists(fullPath) && !Directory.Exists(fullPath)) return MissingNote(notePath, name);
        return new JsonObject
        {
            ["ok"] = true,
            ["folder"] = name,
            ["note"] = notePath,
            ["content"] = Files.ReadText(fullPath),
            ["mtimeMs"] = Files.MtimeMs(fullPath),
        };
    }

    // One of the folder's custom file templates (.templates/). {{date}}/{{time}}/{{datetime}} use the app's default
    // formats, not the GUI's settings: those are per-install and this may run on a machine with no GUI at all.
    private static string RenderNoteTemplate(string root, string templateName, string title, JsonObject? values)
    {
        var templates = Templates.List(root);
        var template = templates.FirstOrDefault(t => t.Name.ToLowerInvariant() == templateName.ToLowerInvariant());
        if (template is null)
        {
            var known = templates.Count == 0 ? "(none)" : string.Join(", ", templates.Select(t => t.Name));
            throw new InvalidOperationException($"No template named \"{templateName}\". Known templates: {known}");
        }
        var defaults = AppSettingsNormalizer.Defaults();
        var expanded = TemplateRender.ExpandBuiltInDateVars(Files.ReadText(template.Path), DateTime.Now,
            new TemplateRender.DateVarDefaults((string)defaults["dateFormat"]!, (string)defaults["timeFormat"]!, (string)defaults["datetimeFormat"]!));

        var map = new Dictionary<string, string>();
        if (values is not null)
            foreach (var (key, value) in values)
                if (value is not null) map[key] = Js.IsString(value, out var s) ? s : value.ToJsonString();
        map["title"] = title;
        return TemplateRender.Render(expanded, map);
    }

    public JsonObject AddNote(string folderName, string title, string content, string? subfolder = null,
        string? templateName = null, JsonObject? templateValues = null)
    {
        var entry = ResolveFolder(folderName);
        var root = NotesFolderRegistry.RootOf(entry);

        var dir = !string.IsNullOrEmpty(subfolder) ? Join(root, subfolder) : root;
        EnsureInside(root, dir);
        Directory.CreateDirectory(dir);

        var safeTitle = title.Trim();
        if (safeTitle.Length == 0) safeTitle = "New Note";
        var fullPath = NotesFolderFs.UniqueNotePath(dir, safeTitle);
        var finalTitle = Path.GetFileNameWithoutExtension(fullPath);
        var finalContent = templateName is not null ? RenderNoteTemplate(root, templateName, finalTitle, templateValues) : content;
        Files.WriteText(fullPath, finalContent);

        var renamed = finalTitle != safeTitle;
        return new JsonObject
        {
            ["ok"] = true,
            ["folder"] = NotesFolderRegistry.NameOf(entry),
            ["note"] = Path.GetRelativePath(root, fullPath),
            ["renamed"] = renamed,
            ["message"] = renamed
                ? $"Created note \"{finalTitle}\" (title \"{safeTitle}\" was already in use)."
                : $"Created note \"{finalTitle}\".",
        };
    }

    // Create-or-overwrite at an exact path, as opposed to AddNote's rename-on-collision.
    public JsonObject SetNote(string folderName, string notePath, string content, double? expectedMtimeMs = null)
    {
        var (name, root, fullPath, rel) = ResolveNote(folderName, notePath);

        var created = !File.Exists(fullPath) && !Directory.Exists(fullPath);
        if (!created)
        {
            if (CheckExpectedMtime(fullPath, expectedMtimeMs) is { } conflict) return conflict;
            NoteHistory.Record(paths.History, root, rel, Files.ReadText(fullPath));
        }
        Files.EnsureParentDirectory(fullPath);
        Files.WriteText(fullPath, content);

        return new JsonObject
        {
            ["ok"] = true,
            ["folder"] = name,
            ["note"] = notePath,
            ["created"] = created,
            ["mtimeMs"] = Files.MtimeMs(fullPath),
            ["message"] = created ? $"Created note \"{notePath}\"." : $"Overwrote note \"{notePath}\".",
        };
    }

    private static string AppendText(string existing, string text) =>
        existing + (existing.Length > 0 && !existing.EndsWith('\n') ? "\n" : "") + text;

    private static readonly Regex HeadingRe = new(@"^(#{1,6})\s+(.*?)\s*$", RegexOptions.CultureInvariant);

    // Inserts text as a new line at the end of the section under the first heading matching `heading`
    // (case-insensitive): just before the next heading of the same or shallower level, or at the end of the note.
    private static string? InsertUnderHeading(string existing, string heading, string text)
    {
        var lines = existing.Split('\n');
        var target = heading.Trim().ToLowerInvariant();

        var sectionStart = -1;
        var sectionLevel = 0;
        for (var i = 0; i < lines.Length; i++)
        {
            var m = HeadingRe.Match(lines[i]);
            if (m.Success && m.Groups[2].Value.Trim().ToLowerInvariant() == target)
            {
                sectionStart = i;
                sectionLevel = m.Groups[1].Length;
                break;
            }
        }
        if (sectionStart == -1) return null;

        var sectionEnd = lines.Length;
        for (var i = sectionStart + 1; i < lines.Length; i++)
        {
            var m = HeadingRe.Match(lines[i]);
            if (m.Success && m.Groups[1].Length <= sectionLevel)
            {
                sectionEnd = i;
                break;
            }
        }
        // Trailing blank lines in the section are skipped so the new line lands right after its content.
        while (sectionEnd > sectionStart + 1 && lines[sectionEnd - 1].Trim().Length == 0) sectionEnd--;

        return string.Join('\n', lines.Take(sectionEnd).Append(text).Concat(lines.Skip(sectionEnd)));
    }

    public JsonObject UpdateNote(string folderName, string notePath, string additionalText, string? heading = null, double? expectedMtimeMs = null)
    {
        var (name, root, fullPath, rel) = ResolveNote(folderName, notePath);
        if (!File.Exists(fullPath) && !Directory.Exists(fullPath)) return MissingNote(notePath, name);
        if (CheckExpectedMtime(fullPath, expectedMtimeMs) is { } conflict) return conflict;

        var existing = Files.ReadText(fullPath);
        var content = heading is not null ? InsertUnderHeading(existing, heading, additionalText) : AppendText(existing, additionalText);
        if (content is null) return Fail($"Heading \"{heading}\" was not found in note \"{notePath}\".");

        NoteHistory.Record(paths.History, root, rel, existing);
        Files.WriteText(fullPath, content);
        return new JsonObject
        {
            ["ok"] = true,
            ["folder"] = name,
            ["note"] = notePath,
            ["content"] = content,
            ["mtimeMs"] = Files.MtimeMs(fullPath),
        };
    }

    public JsonObject DeleteNote(string folderName, string notePath, double? expectedMtimeMs = null)
    {
        var (name, root, fullPath, rel) = ResolveNote(folderName, notePath);
        if (!File.Exists(fullPath) && !Directory.Exists(fullPath)) return MissingNote(notePath, name);
        if (CheckExpectedMtime(fullPath, expectedMtimeMs) is { } conflict) return conflict;

        // Forced past the autosave throttle so restore_note_version can always bring a deleted note back.
        NoteHistory.Record(paths.History, root, rel, Files.ReadText(fullPath), new NoteHistory.Options(Force: true));
        File.Delete(fullPath);
        return new JsonObject { ["ok"] = true, ["folder"] = name, ["note"] = notePath, ["message"] = $"Deleted note \"{notePath}\"." };
    }

    public JsonObject SearchNotes(string folderName, string query, SearchNotesOptions options)
    {
        var entry = ResolveFolder(folderName);
        var root = NotesFolderRegistry.RootOf(entry);
        var searchOptions = new SearchOptions(query, options.Regex ? "regex" : "plain", options.WholeWord, options.CaseSensitive);

        var results = new JsonArray();
        foreach (var file in NotesFolderFs.ListMarkdownFiles(root))
        {
            var matches = Search.SearchContent(Files.ReadText(file), searchOptions);
            if (matches.Count > 0)
                results.Add(new JsonObject
                {
                    ["note"] = Path.GetRelativePath(root, file),
                    ["matches"] = JsonSerializer.SerializeToNode(matches, CairnJson.Options),
                });
        }
        return new JsonObject { ["ok"] = true, ["folder"] = NotesFolderRegistry.NameOf(entry), ["query"] = query, ["results"] = results };
    }

    public JsonObject GetProperties(string folderName, string notePath)
    {
        var (name, _, fullPath, _) = ResolveNote(folderName, notePath);
        if (!File.Exists(fullPath) && !Directory.Exists(fullPath)) return MissingNote(notePath, name);
        return new JsonObject
        {
            ["ok"] = true,
            ["folder"] = name,
            ["note"] = notePath,
            ["properties"] = NoteProperties.ReadProperties(fullPath),
            ["mtimeMs"] = Files.MtimeMs(fullPath),
        };
    }

    // JSON Merge Patch (RFC 7396): unmentioned keys stay, a key set to null is removed. Validation against the
    // folder's property schema is advisory, as in the GUI: an invalid value is still saved and reported as a warning.
    public JsonObject SetProperties(string folderName, string notePath, JsonObject patch, double? expectedMtimeMs = null)
    {
        var (name, root, fullPath, rel) = ResolveNote(folderName, notePath);
        if (!File.Exists(fullPath) && !Directory.Exists(fullPath)) return MissingNote(notePath, name);
        if (CheckExpectedMtime(fullPath, expectedMtimeMs) is { } conflict) return conflict;

        var merged = NoteProperties.ReadProperties(fullPath);
        foreach (var (key, value) in patch)
            merged[key] = value?.DeepClone();
        foreach (var (key, value) in patch)
            if (value is null) merged.Remove(key);
        NoteProperties.SaveProperties(fullPath, merged);

        var schema = PropertiesSchema.Read(root);
        var warnings = new JsonObject();
        foreach (var (key, value) in patch)
        {
            if (value is null) continue;
            var def = schema.OfType<JsonObject>().FirstOrDefault(p => ((string)p["name"]!).ToLowerInvariant() == key.ToLowerInvariant());
            var warning = def is null ? null : PropertyValidation.Validate(def, merged[key]);
            if (warning is not null) warnings[key] = warning;
        }

        var result = new JsonObject
        {
            ["ok"] = true,
            ["folder"] = name,
            ["note"] = notePath,
            ["properties"] = merged,
            ["mtimeMs"] = Files.MtimeMs(fullPath),
        };
        if (warnings.Count > 0) result["warnings"] = warnings;
        return result;
    }

    // Links that resolve to this note's title, as in the GUI's graph; notes that merely share a tag are excluded.
    public JsonObject GetBacklinks(string folderName, string notePath)
    {
        var (name, root, fullPath, rel) = ResolveNote(folderName, notePath);
        if (!File.Exists(fullPath) && !Directory.Exists(fullPath)) return MissingNote(notePath, name);

        var notes = NotesFolderFs.LoadNotesFolder(root);
        var graph = GraphBuilder.Build(notes);
        var byLowerTitle = new Dictionary<string, Note>();
        foreach (var n in notes) byLowerTitle[n.Title.ToLowerInvariant()] = n;

        var backlinks = new JsonArray();
        foreach (var title in GraphBuilder.BacklinkTitles(graph, NoteLinks.TitleFromPath(notePath)))
            if (byLowerTitle.TryGetValue(title.ToLowerInvariant(), out var note)) backlinks.Add(note.RelativePath);

        return new JsonObject { ["ok"] = true, ["folder"] = name, ["note"] = notePath, ["backlinks"] = backlinks };
    }

    public JsonObject GetTags(string folderName)
    {
        var entry = ResolveFolder(folderName);
        var byTag = new Dictionary<string, List<string>>();
        foreach (var note in NotesFolderFs.LoadNotesFolder(NotesFolderRegistry.RootOf(entry)))
            foreach (var tag in note.Tags)
            {
                if (!byTag.TryGetValue(tag, out var list)) byTag[tag] = list = new List<string>();
                list.Add(note.RelativePath);
            }

        var tags = new JsonArray();
        foreach (var tag in byTag.Keys.OrderBy(t => t, StringComparer.InvariantCulture))
            tags.Add(new JsonObject { ["tag"] = tag, ["notes"] = new JsonArray(byTag[tag].Select(n => (JsonNode)n).ToArray()) });
        return new JsonObject { ["ok"] = true, ["folder"] = NotesFolderRegistry.NameOf(entry), ["tags"] = tags };
    }

    public JsonObject GetOrphanedAttachments(string folderName)
    {
        var entry = ResolveFolder(folderName);
        var root = NotesFolderRegistry.RootOf(entry);
        var orphaned = Attachments.FindOrphaned(root, NotesFolderFs.LoadNotesFolder(root));
        return new JsonObject
        {
            ["ok"] = true,
            ["folder"] = NotesFolderRegistry.NameOf(entry),
            ["orphaned"] = new JsonArray(orphaned.Select(o => (JsonNode)o).ToArray()),
        };
    }

    // Recomputed fresh rather than trusting a possibly stale list from an earlier get_orphaned_attachments call.
    public JsonObject DeleteOrphanedAttachments(string folderName)
    {
        var entry = ResolveFolder(folderName);
        var root = NotesFolderRegistry.RootOf(entry);
        var orphaned = Attachments.FindOrphaned(root, NotesFolderFs.LoadNotesFolder(root));
        Attachments.Delete(root, orphaned);
        return new JsonObject
        {
            ["ok"] = true,
            ["folder"] = NotesFolderRegistry.NameOf(entry),
            ["deleted"] = new JsonArray(orphaned.Select(o => (JsonNode)o).ToArray()),
        };
    }

    // Only folders that have been granted access: an agent's view of what exists matches what it can touch.
    public JsonObject ListFolders()
    {
        var access = CliAccess.Read(paths.CliAccess);
        var folders = new JsonArray();
        foreach (var f in Registry().Where(f => CliAccess.IsAllowed(access, NotesFolderRegistry.NameOf(f))))
            folders.Add(new JsonObject { ["name"] = NotesFolderRegistry.NameOf(f), ["root"] = NotesFolderRegistry.RootOf(f) });
        return new JsonObject { ["ok"] = true, ["folders"] = folders };
    }

    public JsonObject GetNoteHistory(string folderName, string notePath)
    {
        var (name, root, _, rel) = ResolveNote(folderName, notePath);
        var versions = new JsonArray();
        foreach (var ts in NoteHistory.List(paths.History, root, rel))
            versions.Add(new JsonObject { ["timestamp"] = ts });
        return new JsonObject { ["ok"] = true, ["folder"] = name, ["note"] = notePath, ["versions"] = versions };
    }

    // The note's current content is snapshotted first (past the throttle), so restoring is never a one-way trip.
    public JsonObject RestoreNoteVersion(string folderName, string notePath, string timestamp, double? expectedMtimeMs = null)
    {
        var (name, root, fullPath, rel) = ResolveNote(folderName, notePath);

        var versionContent = NoteHistory.Read(paths.History, root, rel, timestamp);
        if (versionContent is null) return Fail($"No history snapshot of \"{notePath}\" found at timestamp \"{timestamp}\".");

        if (File.Exists(fullPath) || Directory.Exists(fullPath))
        {
            if (CheckExpectedMtime(fullPath, expectedMtimeMs) is { } conflict) return conflict;
            NoteHistory.Record(paths.History, root, rel, Files.ReadText(fullPath), new NoteHistory.Options(Force: true));
        }

        Files.EnsureParentDirectory(fullPath);
        Files.WriteText(fullPath, versionContent);
        return new JsonObject
        {
            ["ok"] = true,
            ["folder"] = name,
            ["note"] = notePath,
            ["restoredFrom"] = timestamp,
            ["mtimeMs"] = Files.MtimeMs(fullPath),
            ["message"] = $"Restored \"{notePath}\" to the version from {timestamp}.",
        };
    }
}

/// <summary>Port of shared/validateProperty.ts: advisory only, the caller still saves an invalid value.</summary>
public static class PropertyValidation
{
    public static string? Validate(JsonObject def, JsonNode? value)
    {
        var rules = def["rules"] as JsonObject;
        return def["type"]?.ToString() switch
        {
            "text" => ValidateText(rules, value),
            "number" => ValidateNumber(rules, value),
            _ => null,
        };
    }

    private static string? ValidateText(JsonObject? rules, JsonNode? value)
    {
        if (!Js.IsString(value, out var text)) return null;
        if (Js.IsNumber(rules?["maxLength"], out var maxLength) && text.Length > maxLength)
            return $"Must be {JsNumber.ToString(maxLength)} characters or fewer";
        if (Js.IsString(rules?["pattern"], out var pattern) && pattern.Length > 0 && text.Length > 0)
        {
            var re = BuildPattern(pattern);
            if (re is null) return null; // an invalid saved pattern shouldn't block or crash the check
            if (!re.IsMatch(text)) return "Does not match the required format";
        }
        return null;
    }

    private static Regex? BuildPattern(string pattern)
    {
        // ECMAScript mode makes \w, \d and \s behave as in JavaScript; some .NET-only constructs need the regular mode.
        try { return new Regex(pattern, RegexOptions.ECMAScript | RegexOptions.CultureInvariant); }
        catch (ArgumentException)
        {
            try { return new Regex(pattern, RegexOptions.CultureInvariant); }
            catch (ArgumentException) { return null; }
        }
    }

    private static string? ValidateNumber(JsonObject? rules, JsonNode? value)
    {
        if (!Js.IsNumber(value, out var n) || double.IsNaN(n)) return null;
        if (Js.IsBool(rules?["integerOnly"], out var integerOnly) && integerOnly && n != Math.Floor(n)) return "Must be a whole number";
        if (Js.IsNumber(rules?["min"], out var min) && n < min) return $"Must be at least {JsNumber.ToString(min)}";
        if (Js.IsNumber(rules?["max"], out var max) && n > max) return $"Must be at most {JsNumber.ToString(max)}";
        return null;
    }
}
