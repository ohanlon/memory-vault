using System.Text.Json.Nodes;
using Cairn.Core.Markdown;
using Cairn.Core.Models;
using Xunit;

namespace Cairn.Core.Tests;

public class MarkdownGoldenTests
{
    public static IEnumerable<object[]> NoteCases => Golden.Cases("notes");
    public static IEnumerable<object[]> StringifyCases => Golden.Cases("stringified");
    public static IEnumerable<object[]> RoundTripCases => Golden.Cases("roundTrips");

    [Theory]
    [MemberData(nameof(NoteCases))]
    public void ParseNoteMatchesTypeScript(int index)
    {
        var c = Golden.Case("notes", index);
        var name = (string)c["name"]!;
        var raw = (string)c["raw"]!;
        var relativePath = (string)c["relativePath"]!;
        var expectedError = (bool)c["error"]!;

        if (expectedError)
        {
            Assert.ThrowsAny<Exception>(() => NoteParser.Parse("/root/" + relativePath, relativePath, raw, 1700000000123.5));
            return;
        }

        var note = NoteParser.Parse("/root/" + relativePath, relativePath, raw, 1700000000123.5);
        var actual = CairnJson.ToNode(note);
        var flat = Cairn.Core.Yaml.YamlDate.Flatten(actual);
        Assert.True(JsonCompare.Diff(c["parsed"], flat) is null, $"{name}: {JsonCompare.Diff(c["parsed"], flat)}");
    }

    [Theory]
    [MemberData(nameof(StringifyCases))]
    public void StringifyMatchesGrayMatter(int index)
    {
        var c = Golden.Case("stringified", index);
        var name = (string)c["name"]!;
        var data = c["data"]!.DeepClone().AsObject();
        var expected = c["output"]?.GetValue<string>();

        // Only a literal JS string reaches js-yaml as a string; nothing in the fixtures needs date markers here.
        var actual = Matter.Stringify((string)c["content"]!, data);
        Assert.Equal(expected, actual);
        _ = name;
    }

    [Theory]
    [MemberData(nameof(RoundTripCases))]
    public void SaveBodyRoundTripMatchesGrayMatter(int index)
    {
        var c = Golden.Case("roundTrips", index);
        var parsed = Matter.Parse((string)c["raw"]!);
        var body = (string)c["body"]!;
        var actual = parsed.Data.Count > 0 ? Matter.Stringify(body, parsed.Data) : body;
        Assert.Equal((string)c["output"]!, actual);
    }

    [Fact]
    public void GraphMatchesTypeScript()
    {
        var section = Golden.Section("graph");
        var notes = section["input"]!.AsArray()
            .Select(n => NoteParser.Parse((string)n!["path"]!, (string)n["relativePath"]!, (string)n["raw"]!, 0))
            .ToList();
        var graph = GraphBuilder.Build(notes);
        var actual = CairnJson.ToNode(graph);
        Assert.True(JsonCompare.Diff(section["output"], actual) is null, JsonCompare.Diff(section["output"], actual));
    }

    [Fact]
    public void ExportRewritesMatchTypeScript()
    {
        foreach (var c in Golden.Section("exportRewrites").AsArray())
        {
            var content = (string)c!["content"]!;
            string? Resolve(string title) => title.Equals("target", StringComparison.OrdinalIgnoreCase) ? "target-slug" : null;
            Assert.Equal((string)c["wikilinks"]!, NoteLinks.RewriteWikilinksForExport(content, Resolve));
            Assert.Equal((string)c["markdown"]!, NoteLinks.RewriteNoteLinksForExport(content, Resolve));
        }
    }

    [Fact]
    public void ImageEmbedsMatchTypeScript()
    {
        foreach (var c in Golden.Section("imageEmbeds").AsArray())
        {
            var expected = c!["hrefs"]!.AsArray().Select(h => (string)h!).ToList();
            Assert.Equal(expected, NoteLinks.ExtractImageEmbeds((string)c["content"]!));
        }
    }
}
