using System.Text.Json.Nodes;
using Cairn.Core.Storage;
using Xunit;

namespace Cairn.Core.Tests;

public class TemplateSearchGoldenTests
{
    public static IEnumerable<object[]> RenderCases => Golden.Cases("renders");
    public static IEnumerable<object[]> DateVarCases => Golden.Cases("dateVars");

    [Theory]
    [MemberData(nameof(RenderCases))]
    public void MustacheRenderMatchesMustacheJs(int index)
    {
        var c = Golden.Case("renders", index);
        var values = c["values"]!.AsObject().ToDictionary(kv => kv.Key, kv => (string)kv.Value!);
        var actual = TemplateRender.Render((string)c["template"]!, values);
        Assert.Equal((string?)c["output"], actual);
    }

    [Theory]
    [MemberData(nameof(DateVarCases))]
    public void DateVariableExpansionMatchesTypeScript(int index)
    {
        var c = Golden.Case("dateVars", index);
        var p = c["parts"]!.AsArray().Select(x => (int)x!).ToArray();
        var now = new DateTime(p[0], p[1] + 1, p[2], p[3], p[4], p[5]);
        var d = c["defaults"]!;
        var defaults = new TemplateRender.DateVarDefaults((string)d["date"]!, (string)d["time"]!, (string)d["datetime"]!);
        Assert.Equal((string)c["output"]!, TemplateRender.ExpandBuiltInDateVars((string)c["template"]!, now, defaults));
    }

    private static SearchOptions OptionsFrom(JsonNode o) => new(
        (string)o["query"]!, (string)o["mode"]!, (bool)o["wholeWord"]!, o["caseSensitive"] is null ? null : (bool)o["caseSensitive"]!);

    [Fact]
    public void SearchMatchesTypeScript()
    {
        var section = Golden.Section("search");
        var contents = (string)section["contents"]!;
        foreach (var c in section["searches"]!.AsArray())
        {
            var options = OptionsFrom(c!["options"]!);
            var expected = c["matches"]!.AsArray()
                .Select(m => new SearchMatch((int)m!["line"]!, (string)m["lineText"]!, (int)m["start"]!, (int)m["end"]!))
                .ToList();
            Assert.True(expected.SequenceEqual(Search.SearchContent(contents, options)), $"query {options.Query} ({options.Mode})");
        }
    }

    [Fact]
    public void ReplaceAllMatchesTypeScript()
    {
        var section = Golden.Section("search");
        var contents = (string)section["contents"]!;
        foreach (var c in section["replacements"]!.AsArray())
        {
            var options = OptionsFrom(c!["options"]!);
            var replace = (string)c["replace"]!;
            var (text, count) = Search.ReplaceAllInContent(contents, options, replace);
            Assert.Equal((string)c["result"]!["content"]!, text);
            Assert.Equal((int)c["result"]!["count"]!, count);
        }
    }
}

public class YamlDumpGoldenTests
{
    public static IEnumerable<object[]> SchemaCases => Golden.Cases("schemaDumps");

    [Theory]
    [MemberData(nameof(SchemaCases))]
    public void PropertySchemaDumpMatchesJsYaml(int index)
    {
        var c = Golden.Case("schemaDumps", index);
        var properties = c["properties"]!.DeepClone().AsArray();
        var actual = Cairn.Core.Yaml.YamlDumper.SafeDump(new System.Text.Json.Nodes.JsonObject { ["properties"] = properties });
        Assert.Equal((string)c["output"]!, actual);
    }
}
