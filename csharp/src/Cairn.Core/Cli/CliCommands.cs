using System.Text.Json;
using System.Text.Json.Nodes;
using Cairn.Core.Storage;

namespace Cairn.Core.Cli;

/// <summary>Port of the argument handling in electron/cli.ts: the same commands, flags and usage messages.</summary>
public static class CliCommands
{
    public static readonly IReadOnlyList<string> Names = new[]
    {
        "add_folder", "get_notes", "get_note", "add_note", "set_note", "update_note", "delete_note", "search_notes",
        "get_properties", "set_properties", "get_backlinks", "get_tags", "list_folders", "get_note_history",
        "restore_note_version", "get_orphaned_attachments", "delete_orphaned_attachments",
    };

    /// <summary>The arguments from the first known command name onward, or null if there is none.</summary>
    public static string[]? ExtractArgs(string[] argv)
    {
        var idx = Array.FindIndex(argv, a => Names.Contains(a));
        return idx == -1 ? null : argv[idx..];
    }

    private sealed record Parsed(List<string> Positional, Dictionary<string, string?> Flags)
    {
        // A flag with no value (next argument missing or another flag) is present with a null value.
        public bool Has(string key) => Flags.ContainsKey(key);
        public string? Str(string key) => Flags.GetValueOrDefault(key);
        public bool Bool(string key) => Flags.ContainsKey(key);
    }

    private static Parsed Parse(IReadOnlyList<string> args)
    {
        var positional = new List<string>();
        var flags = new Dictionary<string, string?>();
        for (var i = 0; i < args.Count; i++)
        {
            var arg = args[i];
            if (arg.StartsWith("--", StringComparison.Ordinal))
            {
                var key = arg[2..];
                if (i + 1 < args.Count && !args[i + 1].StartsWith("--", StringComparison.Ordinal))
                    flags[key] = args[++i];
                else
                    flags[key] = null;
            }
            else positional.Add(arg);
        }
        return new Parsed(positional, flags);
    }

    private static double? ExpectedMtime(Parsed p, string usage)
    {
        var raw = p.Str("if-unmodified-since");
        if (raw is null) return null;
        // JavaScript's Number() accepts surrounding whitespace and rejects anything else non-numeric.
        if (!double.TryParse(raw.Trim(), System.Globalization.NumberStyles.Float, System.Globalization.CultureInfo.InvariantCulture, out var n))
            throw new InvalidOperationException($"--if-unmodified-since must be a number (a note's mtimeMs). Usage: {usage}");
        return n;
    }

    // --content-file reads a file, or stdin to EOF when given "-"; --content is used verbatim. When neither is given
    // the caller decides whether that is an error (required) or just "".
    private static string ResolveContent(Parsed p, string usage, bool required, Func<string> readStdin)
    {
        var content = p.Str("content");
        var contentFile = p.Str("content-file");
        if (content is not null && contentFile is not null)
            throw new InvalidOperationException($"Specify either --content or --content-file, not both. Usage: {usage}");
        if (contentFile is not null)
        {
            if (contentFile == "-") return readStdin();
            if (!File.Exists(contentFile)) throw new InvalidOperationException($"Content file \"{contentFile}\" does not exist.");
            return Files.ReadText(contentFile);
        }
        if (content is not null) return content;
        if (required) throw new InvalidOperationException($"Usage: {usage}");
        return "";
    }

    private static JsonObject ParseObject(string json, string flag, string usage)
    {
        JsonNode? parsed;
        try { parsed = JsonNode.Parse(json); }
        catch (JsonException) { throw new InvalidOperationException($"{flag} must be valid JSON. Usage: {usage}"); }
        return parsed as JsonObject ?? throw new InvalidOperationException($"{flag} must be a JSON object. Usage: {usage}");
    }

    public static JsonObject Run(string[] args, CliOperations ops, Func<string>? readStdin = null)
    {
        readStdin ??= () => Console.In.ReadToEnd();
        var command = args.Length > 0 ? args[0] : null;
        var p = Parse(args.Skip(1).ToList());
        var folder = p.Str("folder");
        var note = p.Positional.Count > 0 ? p.Positional[0] : null;

        // Most commands need --folder and a note path; `usage` is checked once here.
        void RequireNote(string usage) { if (string.IsNullOrEmpty(folder) || string.IsNullOrEmpty(note)) throw new InvalidOperationException($"Usage: {usage}"); }
        void RequireFolder(string usage) { if (string.IsNullOrEmpty(folder)) throw new InvalidOperationException($"Usage: {usage}"); }

        switch (command)
        {
            case "add_folder":
            {
                if (string.IsNullOrEmpty(note)) throw new InvalidOperationException("Usage: add_folder <path> [--name NAME]");
                return ops.AddFolder(note, p.Str("name"));
            }
            case "get_notes":
                RequireFolder("get_notes --folder NAME [--subfolders]");
                return ops.GetNotes(folder!, p.Bool("subfolders"));
            case "get_note":
                RequireNote("get_note --folder NAME <notePath>");
                return ops.GetNote(folder!, note!);
            case "add_note":
            {
                const string usage = "add_note --folder NAME <title> [--subfolder PATH] " +
                    "(--content TEXT | --content-file PATH|- | --template NAME [--values '{\"key\":\"value\"}'])";
                RequireNote(usage);
                var templateName = p.Str("template");
                var valuesJson = p.Str("values");
                if (templateName is not null && (p.Has("content") || p.Has("content-file")))
                    throw new InvalidOperationException($"Specify either --content/--content-file or --template, not both. Usage: {usage}");
                if (valuesJson is not null && templateName is null)
                    throw new InvalidOperationException($"--values requires --template. Usage: {usage}");
                var values = valuesJson is null ? null : ParseObject(valuesJson, "--values", usage);
                var content = ResolveContent(p, usage, false, readStdin);
                return ops.AddNote(folder!, note!, content, p.Str("subfolder"), templateName, values);
            }
            case "set_note":
            {
                const string usage = "set_note --folder NAME <notePath> (--content TEXT | --content-file PATH|-) [--if-unmodified-since MTIME_MS]";
                RequireNote(usage);
                var content = ResolveContent(p, usage, true, readStdin);
                return ops.SetNote(folder!, note!, content, ExpectedMtime(p, usage));
            }
            case "update_note":
            {
                const string usage = "update_note --folder NAME <notePath> (--content TEXT | --content-file PATH|-) [--heading NAME] [--if-unmodified-since MTIME_MS]";
                RequireNote(usage);
                var content = ResolveContent(p, usage, true, readStdin);
                return ops.UpdateNote(folder!, note!, content, p.Str("heading"), ExpectedMtime(p, usage));
            }
            case "delete_note":
            {
                const string usage = "delete_note --folder NAME <notePath> [--if-unmodified-since MTIME_MS]";
                RequireNote(usage);
                return ops.DeleteNote(folder!, note!, ExpectedMtime(p, usage));
            }
            case "search_notes":
                RequireNote("search_notes --folder NAME <query> [--regex] [--case-sensitive] [--whole-word]");
                return ops.SearchNotes(folder!, note!, new SearchNotesOptions(p.Bool("regex"), p.Bool("case-sensitive"), p.Bool("whole-word")));
            case "get_properties":
                RequireNote("get_properties --folder NAME <notePath>");
                return ops.GetProperties(folder!, note!);
            case "set_properties":
            {
                const string usage = "set_properties --folder NAME <notePath> --json '{\"key\":\"value\",...}' [--if-unmodified-since MTIME_MS]";
                var json = p.Str("json");
                RequireNote(usage);
                if (json is null) throw new InvalidOperationException($"Usage: {usage}");
                return ops.SetProperties(folder!, note!, ParseObject(json, "--json", usage), ExpectedMtime(p, usage));
            }
            case "get_backlinks":
                RequireNote("get_backlinks --folder NAME <notePath>");
                return ops.GetBacklinks(folder!, note!);
            case "get_tags":
                RequireFolder("get_tags --folder NAME");
                return ops.GetTags(folder!);
            case "list_folders":
                return ops.ListFolders();
            case "get_note_history":
                RequireNote("get_note_history --folder NAME <notePath>");
                return ops.GetNoteHistory(folder!, note!);
            case "restore_note_version":
            {
                const string usage = "restore_note_version --folder NAME <notePath> --timestamp ISO_TIMESTAMP [--if-unmodified-since MTIME_MS]";
                var timestamp = p.Str("timestamp");
                RequireNote(usage);
                if (string.IsNullOrEmpty(timestamp)) throw new InvalidOperationException($"Usage: {usage}");
                return ops.RestoreNoteVersion(folder!, note!, timestamp, ExpectedMtime(p, usage));
            }
            case "get_orphaned_attachments":
                RequireFolder("get_orphaned_attachments --folder NAME");
                return ops.GetOrphanedAttachments(folder!);
            case "delete_orphaned_attachments":
                RequireFolder("delete_orphaned_attachments --folder NAME");
                return ops.DeleteOrphanedAttachments(folder!);
            default:
                throw new InvalidOperationException($"Unknown command \"{command}\"");
        }
    }
}
