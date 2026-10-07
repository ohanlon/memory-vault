using System.Globalization;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;
using Cairn.Core.Shared;
using Stubble.Core.Builders;

namespace Cairn.Core.Storage;

/// <summary>Port of shared/templateRender.ts: {{date}}/{{time}}/{{datetime}} expansion followed by a Mustache render.</summary>
public static class TemplateRender
{
    public sealed record DateVarDefaults(string Date, string Time, string Datetime);

    // {{date}}, {{time}}, {{datetime}} and their {{date:FORMAT}} variants - handled with their own regex rather
    // than Mustache's tag parser, so a colon in the tag name never depends on Mustache accepting it.
    private static readonly Regex DateVarTag = new(@"\{\{\s*(date|time|datetime)\s*(?::\s*([^}]+?))?\s*\}\}", RegexOptions.CultureInvariant);

    private static readonly Stubble.Core.StubbleVisitorRenderer Renderer = new StubbleBuilder()
        .Configure(settings => settings.SetEncodingFunction(value => value)) // markdown, not HTML: never escape
        .Build();

    public static string ExpandBuiltInDateVars(string template, DateTime now, DateVarDefaults defaults) =>
        DateVarTag.Replace(template, m =>
        {
            var custom = m.Groups[2].Success ? m.Groups[2].Value.Trim() : "";
            var pattern = custom.Length > 0
                ? custom
                : m.Groups[1].Value switch { "date" => defaults.Date, "time" => defaults.Time, _ => defaults.Datetime };
            return DateFormat.Format(now, pattern);
        });

    /// <summary>Renders without HTML-escaping.</summary>
    public static string Render(string template, IReadOnlyDictionary<string, string> values) =>
        Renderer.Render(template, values.ToDictionary(kv => kv.Key, kv => (object)kv.Value));
}

public sealed record FileTemplate(string Path, string Name);

/// <summary>Port of electron/templates.ts: user templates living in each folder's hidden .templates directory.</summary>
public static class Templates
{
    public const string DirName = ".templates";

    public static string DirFor(string root) => Path.Combine(root, DirName);

    private static int CompareNames(string a, string b) => string.Compare(a, b, CultureInfo.CurrentCulture, CompareOptions.None);

    public static List<FileTemplate> List(string root)
    {
        var dir = DirFor(root);
        if (!Directory.Exists(dir)) return new List<FileTemplate>();
        try
        {
            return Directory.EnumerateFiles(dir)
                .Where(f => f.EndsWith(".md", StringComparison.OrdinalIgnoreCase))
                .Select(f => new FileTemplate(f, Path.GetFileName(f)[..^3]))
                .OrderBy(t => t.Name, Comparer<string>.Create(CompareNames))
                .ToList();
        }
        catch (Exception e) when (e is IOException or UnauthorizedAccessException)
        {
            return new List<FileTemplate>();
        }
    }

    /// <summary>Every template across every registered notes folder, so a template made in one is usable from any other.</summary>
    public static List<FileTemplate> ListAll(IEnumerable<JsonObject> notesFolders) =>
        notesFolders.SelectMany(f => List(NotesFolderRegistry.RootOf(f)))
            .OrderBy(t => t.Name, Comparer<string>.Create(CompareNames))
            .ToList();

    /// <summary>Copies a note's raw content into root's .templates folder under its own title, numbering around collisions.</summary>
    public static string ConvertToTemplate(string root, string absPath)
    {
        var dir = DirFor(root);
        Directory.CreateDirectory(dir);
        var raw = Files.ReadText(absPath);
        var baseName = Path.GetFileNameWithoutExtension(absPath);
        var fullPath = NotesFolderFs.UniqueNotePath(dir, baseName);
        Files.WriteText(fullPath, raw);
        return fullPath;
    }
}
