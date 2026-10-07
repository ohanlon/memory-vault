using System.Text.Json.Nodes;
using System.Text.RegularExpressions;
using Cairn.Core.Yaml;

namespace Cairn.Core.Markdown;

public sealed record MatterResult(JsonObject Data, string Content);

/// <summary>
/// Port of the parts of gray-matter 4 that Cairn uses: <c>matter(raw)</c> and <c>matter.stringify(content, data)</c>,
/// including its quirks (a "----" opener isn't frontmatter, "---yaml" selects an engine, a missing closing
/// delimiter swallows the rest of the file, and stringify re-parses the content it is given).
/// </summary>
public static class Matter
{
    private const string Open = "---";
    private const string Close = "\n---";
    private const char Bom = (char)0xFEFF;

    private static readonly Regex CommentLines = new(@"^\s*#[^\n]+", RegexOptions.Multiline | RegexOptions.CultureInvariant);
    private static readonly Regex NewlineSearch = new(@"\r?\n", RegexOptions.CultureInvariant);

    /// <summary>Throws (YamlException, JsonException or InvalidOperationException) on unparseable frontmatter, like gray-matter.</summary>
    public static MatterResult Parse(string input)
    {
        if (input.Length == 0) return new MatterResult(new JsonObject(), "");

        var str = input[0] == Bom ? input[1..] : input;

        if (!str.StartsWith(Open, StringComparison.Ordinal)) return new MatterResult(new JsonObject(), str);
        if (str.Length > Open.Length && str[Open.Length] == Open[^1]) return new MatterResult(new JsonObject(), str);

        str = str[Open.Length..];
        var len = str.Length;

        var language = "yaml";
        var nl = NewlineSearch.Match(str);
        var langRaw = str[..(nl.Success ? nl.Index : Math.Max(0, str.Length - 1))];
        var langName = langRaw.Trim();
        if (langName.Length > 0)
        {
            language = langName;
            str = str[langRaw.Length..];
        }

        var closeIndex = str.IndexOf(Close, StringComparison.Ordinal);
        if (closeIndex == -1) closeIndex = len;

        var matterBlock = str[..Math.Min(closeIndex, str.Length)];

        JsonObject data;
        var block = CommentLines.Replace(matterBlock, "").Trim();
        if (block.Length == 0) data = new JsonObject();
        else data = AsObject(ParseEngine(language, matterBlock));

        string content;
        if (closeIndex == len)
        {
            content = "";
        }
        else
        {
            content = str[(closeIndex + Close.Length)..];
            if (content.Length > 0 && content[0] == '\r') content = content[1..];
            if (content.Length > 0 && content[0] == '\n') content = content[1..];
        }
        return new MatterResult(data, content);
    }

    /// <summary><c>matter.stringify(content, data)</c>: frontmatter from <paramref name="data"/> followed by the body.</summary>
    public static string Stringify(string content, JsonObject data)
    {
        var file = Parse(content);

        // Object.assign({}, file.data, data): existing keys keep their position, new ones append.
        var merged = new JsonObject();
        foreach (var (k, v) in file.Data) merged[k] = v?.DeepClone();
        foreach (var (k, v) in data) merged[k] = v?.DeepClone();

        var matter = YamlDumper.SafeDump(merged).Trim();
        var buf = "";
        if (matter != "{}") buf = Newline(Open) + Newline(matter) + Newline(Open);
        return buf + Newline(file.Content);
    }

    private static string Newline(string s) => s.Length == 0 || s[^1] != '\n' ? s + "\n" : s;

    private static JsonObject AsObject(JsonNode? node) => node is JsonObject o ? o : new JsonObject();

    private static JsonNode? ParseEngine(string language, string text)
    {
        switch (language.ToLowerInvariant())
        {
            case "yaml":
            case "yml":
                return YamlLoader.Load(text);
            case "json":
                return JsonNode.Parse(text);
            default:
                throw new InvalidOperationException($"gray-matter engine \"{language}\" is not registered");
        }
    }
}
