using System.Text.Json;
using System.Text.Json.Nodes;

namespace Cairn.Core.Shared;

/// <summary>Loosely-typed JSON accessors that mirror JavaScript's <c>typeof</c> checks.</summary>
public static class Js
{
    public static bool IsString(JsonNode? n, out string value)
    {
        if (n is JsonValue v && v.GetValueKind() == JsonValueKind.String)
        {
            value = v.GetValue<string>();
            return true;
        }
        value = "";
        return false;
    }

    public static bool IsBool(JsonNode? n, out bool value)
    {
        value = false;
        if (n is not JsonValue v) return false;
        switch (v.GetValueKind())
        {
            case JsonValueKind.True: value = true; return true;
            case JsonValueKind.False: return true;
            default: return false;
        }
    }

    /// <summary>A finite JSON number (JSON has no NaN/Infinity, so this is every number).</summary>
    public static bool IsNumber(JsonNode? n, out double value)
    {
        if (n is JsonValue v && v.GetValueKind() == JsonValueKind.Number)
        {
            value = Yaml.YamlDumper.ToDouble(v);
            return double.IsFinite(value);
        }
        value = 0;
        return false;
    }

    public static JsonNode? Get(JsonNode? obj, string key) =>
        obj is JsonObject o && o.TryGetPropertyValue(key, out var v) ? v : null;

    public static JsonValue Num(double d) => JsonValue.Create(d);

    /// <summary>Math.round: halves round toward +Infinity.</summary>
    public static double Round(double d) => Math.Floor(d + 0.5);
}

/// <summary>Port of shared/appSettings.ts: fills in missing/invalid fields with defaults.</summary>
public static class AppSettingsNormalizer
{
    public const int MinEditorFontSize = 10;
    public const int MaxEditorFontSize = 28;

    private static readonly string[] ValidTabFolderDisplay = { "never", "hover", "always" };
    private static readonly string[] ValidTheme = { "dark", "light", "system", "custom" };
    private static readonly string[] ValidEditorFont =
    {
        "system-ui", "roboto", "arimo", "monospace", "open-sans", "montserrat", "scoutie-sans", "valley-sans",
    };
    private static readonly HashSet<string> ValidCodeLanguageIds = new(SharedData.CodeLanguageIds, StringComparer.Ordinal);

    public static JsonObject Defaults() => Normalize(null);

    public static JsonObject Normalize(JsonNode? value)
    {
        var raw = value as JsonObject ?? new JsonObject();

        string Pick(string key, string[] valid, string fallback) =>
            Js.IsString(Js.Get(raw, key), out var s) && Array.IndexOf(valid, s) >= 0 ? s : fallback;

        bool Flag(string key, bool fallback) => Js.IsBool(Js.Get(raw, key), out var b) ? b : fallback;

        string Pattern(string key, string fallback) =>
            Js.IsString(Js.Get(raw, key), out var s) && DateFormat.IsValid(s) ? s : fallback;

        return new JsonObject
        {
            ["tabFolderDisplay"] = Pick("tabFolderDisplay", ValidTabFolderDisplay, "hover"),
            ["theme"] = Pick("theme", ValidTheme, "dark"),
            ["addHeadingToNewNotes"] = Flag("addHeadingToNewNotes", true),
            ["showLineNumbers"] = Flag("showLineNumbers", false),
            ["editorFontFamily"] = Pick("editorFontFamily", ValidEditorFont, "system-ui"),
            ["editorFontSize"] = Js.Num(ClampFontSize(Js.Get(raw, "editorFontSize"), 14)),
            ["enabledCodeLanguages"] = NormalizeEnabledCodeLanguages(Js.Get(raw, "enabledCodeLanguages")),
            ["hasSeenWikilinkHint"] = Flag("hasSeenWikilinkHint", false),
            ["hasSeenTagHint"] = Flag("hasSeenTagHint", false),
            ["hasSeenGraphHint"] = Flag("hasSeenGraphHint", false),
            ["dateFormat"] = Pattern("dateFormat", "YYYY-MM-DD"),
            ["timeFormat"] = Pattern("timeFormat", "HH:mm"),
            ["datetimeFormat"] = Pattern("datetimeFormat", "YYYY-MM-DD HH:mm"),
            ["customThemes"] = NormalizeCustomThemes(Js.Get(raw, "customThemes")),
            ["activeCustomThemeId"] = Js.IsString(Js.Get(raw, "activeCustomThemeId"), out var id) ? id : null,
        };
    }

    private static double ClampFontSize(JsonNode? value, double fallback)
    {
        if (!Js.IsNumber(value, out var d)) return fallback;
        return Math.Min(MaxEditorFontSize, Math.Max(MinEditorFontSize, Js.Round(d)));
    }

    // Keeps only recognized, deduplicated language ids; falls back to the default set only when the value
    // is missing/malformed entirely (a valid but empty array means the user deselected everything).
    private static JsonArray NormalizeEnabledCodeLanguages(JsonNode? value)
    {
        var result = new JsonArray();
        if (value is not JsonArray arr)
        {
            foreach (var id in SharedData.DefaultEnabledCodeLanguages) result.Add(id);
            return result;
        }
        var seen = new HashSet<string>(StringComparer.Ordinal);
        foreach (var item in arr)
            if (Js.IsString(item, out var s) && ValidCodeLanguageIds.Contains(s) && seen.Add(s)) result.Add(s);
        return result;
    }

    private static JsonArray NormalizeCustomThemes(JsonNode? value)
    {
        var result = new JsonArray();
        if (value is not JsonArray arr) return result;
        foreach (var item in arr)
        {
            var theme = NormalizeCustomTheme(item);
            if (theme is not null) result.Add(theme);
        }
        return result;
    }

    /// <summary>
    /// Validates one custom theme, filling any missing/invalid color from its base palette. Null only when the
    /// entry isn't salvageable (not an object, or no valid baseMode to pick a palette from).
    /// </summary>
    public static JsonObject? NormalizeCustomTheme(JsonNode? value)
    {
        if (value is not JsonObject raw) return null;
        if (!Js.IsString(Js.Get(raw, "baseMode"), out var baseMode) || (baseMode != "dark" && baseMode != "light")) return null;

        var defaults = ThemeColors.DefaultsFor(baseMode);
        var rawColors = Js.Get(raw, "colors") as JsonObject;
        var colors = new JsonObject();
        foreach (var name in SharedData.ThemeColorVarNames)
        {
            var candidate = Js.Get(rawColors, name);
            colors[name] = Js.IsString(candidate, out var c) && ThemeColors.IsValidCssColor(c) ? c : defaults[name];
        }

        return new JsonObject
        {
            ["id"] = Js.IsString(Js.Get(raw, "id"), out var id) && id.Length > 0 ? id : Guid.NewGuid().ToString(),
            ["name"] = Js.IsString(Js.Get(raw, "name"), out var name2) && name2.Trim().Length > 0 ? name2 : "Untitled theme",
            ["baseMode"] = baseMode,
            ["colors"] = colors,
        };
    }
}

/// <summary>Port of shared/layoutPrefs.ts.</summary>
public static class LayoutPrefsNormalizer
{
    public const double MinSidebarWidth = 180;
    public const double MaxSidebarWidth = 560;

    public static JsonObject Defaults() => Normalize(null);

    public static JsonObject Normalize(JsonNode? value)
    {
        var raw = value as JsonObject;
        return new JsonObject
        {
            ["sidebarWidth"] = Js.Num(Clamp(Js.Get(raw, "sidebarWidth"), 260)),
            ["rightPanelWidth"] = Js.Num(Clamp(Js.Get(raw, "rightPanelWidth"), 340)),
        };
    }

    private static double Clamp(JsonNode? value, double fallback) =>
        Js.IsNumber(value, out var d) ? Math.Min(MaxSidebarWidth, Math.Max(MinSidebarWidth, d)) : fallback;
}

/// <summary>Port of shared/workspaceState.ts: which tabs a notes folder had open.</summary>
public static class WorkspaceStateNormalizer
{
    public static JsonObject Defaults() => new() { ["openTabs"] = new JsonArray(), ["activeTab"] = null };

    /// <summary>
    /// <paramref name="fallbackRoot"/> qualifies any pre-existing bare-string tab entry from an old workspace.json;
    /// a bare sentinel id (e.g. "@graph") is never root-qualified.
    /// </summary>
    public static JsonObject Normalize(JsonNode? value, string fallbackRoot)
    {
        var raw = value as JsonObject;
        var tabs = new JsonArray();
        if (Js.Get(raw, "openTabs") is JsonArray arr)
        {
            foreach (var entry in arr)
            {
                var tab = NormalizeTabRef(entry, fallbackRoot);
                if (tab is not null) tabs.Add(tab);
            }
        }
        return new JsonObject
        {
            ["openTabs"] = tabs,
            ["activeTab"] = NormalizeTabRef(Js.Get(raw, "activeTab"), fallbackRoot),
        };
    }

    private static JsonNode? NormalizeTabRef(JsonNode? value, string fallbackRoot)
    {
        if (Js.IsString(value, out var s))
        {
            return s.StartsWith('@')
                ? JsonValue.Create(s)
                : new JsonObject { ["root"] = fallbackRoot, ["relativePath"] = s };
        }
        if (value is JsonObject o && Js.IsString(Js.Get(o, "root"), out _) && Js.IsString(Js.Get(o, "relativePath"), out _))
            return o.DeepClone();
        return null;
    }
}
