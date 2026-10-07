using System.Text.Json.Nodes;
using Cairn.Core.Shared;
using Xunit;

namespace Cairn.Core.Tests;

public class SharedGoldenTests
{
    public static IEnumerable<object[]> SettingsCases => Golden.Cases("settings");
    public static IEnumerable<object[]> LayoutCases => Golden.Cases("layout");
    public static IEnumerable<object[]> WorkspaceCases => Golden.Cases("workspace");
    public static IEnumerable<object[]> AvatarCases => Golden.Cases("avatars");
    public static IEnumerable<object[]> TitleCases => Golden.Cases("titles");
    public static IEnumerable<object[]> TemplateCases => Golden.Cases("noteTemplates");

    // The generator encodes `undefined` as {"__undefined": true}.
    private static JsonNode? Input(JsonNode? raw) =>
        raw is JsonObject o && o.ContainsKey("__undefined") ? null : raw?.DeepClone();

    [Theory]
    [MemberData(nameof(SettingsCases))]
    public void AppSettingsNormalization(int index)
    {
        var c = Golden.Case("settings", index);
        var actual = AppSettingsNormalizer.Normalize(Input(c["input"]));
        foreach (var theme in actual["customThemes"]!.AsArray())
        {
            var id = (string)theme!["id"]!;
            if (id.Length == 36 && id.Contains('-')) theme["id"] = "<uuid>";
        }
        Assert.True(JsonCompare.Diff(c["output"], actual) is null, JsonCompare.Diff(c["output"], actual));
    }

    [Theory]
    [MemberData(nameof(LayoutCases))]
    public void LayoutPrefsNormalization(int index)
    {
        var c = Golden.Case("layout", index);
        var actual = LayoutPrefsNormalizer.Normalize(Input(c["input"]));
        Assert.True(JsonCompare.Diff(c["output"], actual) is null, JsonCompare.Diff(c["output"], actual));
    }

    [Theory]
    [MemberData(nameof(WorkspaceCases))]
    public void WorkspaceStateNormalization(int index)
    {
        var c = Golden.Case("workspace", index);
        var actual = WorkspaceStateNormalizer.Normalize(Input(c["input"]), "/fallback");
        Assert.True(JsonCompare.Diff(c["output"], actual) is null, JsonCompare.Diff(c["output"], actual));
    }

    [Theory]
    [MemberData(nameof(AvatarCases))]
    public void AvatarIndexMatchesTypeScript(int index)
    {
        var c = Golden.Case("avatars", index);
        Assert.Equal((int)c["index"]!, Avatars.DefaultIndexForName((string)c["name"]!, Avatars.NotesFolderAvatarCount));
    }

    [Theory]
    [MemberData(nameof(TitleCases))]
    public void InvalidTitleReasonMatchesTypeScript(int index)
    {
        var c = Golden.Case("titles", index);
        Assert.Equal((string?)c["reason"], NoteTitle.InvalidReason((string)c["title"]!));
    }

    [Theory]
    [MemberData(nameof(TemplateCases))]
    public void NoteTemplatesMatchTypeScript(int index)
    {
        var c = Golden.Case("noteTemplates", index);
        var id = (string?)c["id"];
        Assert.Equal((string)c["output"]!, NoteTemplates.Find(id).Build("My Title", (bool)c["addHeading"]!));
    }

    [Fact]
    public void DateFormatMatchesTypeScript()
    {
        var section = Golden.Section("dateFormats");
        foreach (var c in section["cases"]!.AsArray())
        {
            var p = c!["parts"]!.AsArray().Select(x => (int)x!).ToArray();
            var date = new DateTime(p[0], p[1] + 1, p[2], p[3], p[4], p[5]);
            Assert.Equal((string)c["output"]!, DateFormat.Format(date, (string)c["pattern"]!));
        }
        foreach (var c in section["validity"]!.AsArray())
            Assert.Equal((bool)c!["valid"]!, DateFormat.IsValid((string)c["pattern"]!));
    }

    [Fact]
    public void GeneratedStaticDataMatchesTypeScript()
    {
        var data = Golden.Section("staticData");
        Assert.Equal(data["codeLanguageIds"]!.AsArray().Select(x => (string)x!), SharedData.CodeLanguageIds);
        Assert.Equal(data["defaultEnabledCodeLanguages"]!.AsArray().Select(x => (string)x!), SharedData.DefaultEnabledCodeLanguages);
        Assert.Equal(data["themeColorVarNames"]!.AsArray().Select(x => (string)x!), SharedData.ThemeColorVarNames);
        Assert.Equal(data["noteTemplateIds"]!.AsArray().Select(x => (string)x!), NoteTemplates.All.Select(t => t.Id));
        foreach (var (k, v) in data["darkColors"]!.AsObject()) Assert.Equal((string)v!, SharedData.DefaultDarkColors[k]);
        foreach (var (k, v) in data["lightColors"]!.AsObject()) Assert.Equal((string)v!, SharedData.DefaultLightColors[k]);

        var starters = data["starterNotes"]!.AsArray();
        Assert.Equal(starters.Count, SharedData.StarterNotes.Length);
        for (var i = 0; i < starters.Count; i++)
        {
            Assert.Equal((string)starters[i]!["fileName"]!, SharedData.StarterNotes[i].FileName);
            Assert.Equal((string)starters[i]!["content"]!, SharedData.StarterNotes[i].Content);
        }
    }
}
