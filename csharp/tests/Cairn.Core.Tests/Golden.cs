using System.Globalization;
using System.Text.Json.Nodes;

namespace Cairn.Core.Tests;

/// <summary>Loads golden.json, produced by running the original TypeScript (see tests/fixtures/generate.ts).</summary>
public static class Golden
{
    private static readonly Lazy<JsonObject> Data = new(() =>
    {
        var path = Path.Combine(AppContext.BaseDirectory, "golden.json");
        return JsonNode.Parse(File.ReadAllText(path))!.AsObject();
    });

    public static JsonNode Section(string name) => Data.Value[name]!;

    public static IEnumerable<object[]> Cases(string section) =>
        Section(section).AsArray().Select((_, i) => new object[] { i });

    public static JsonNode Case(string section, int index) => Section(section).AsArray()[index]!;
}

public static class JsonCompare
{
    /// <summary>Structural equality (object key order and number representation are ignored). Returns null when equal, else a path+reason.</summary>
    public static string? Diff(JsonNode? expected, JsonNode? actual, string path = "$")
    {
        if (expected is null || actual is null)
            return expected is null && actual is null ? null : $"{path}: expected {Show(expected)} but was {Show(actual)}";

        switch (expected)
        {
            case JsonObject eo:
                if (actual is not JsonObject ao) return $"{path}: expected object but was {Show(actual)}";
                foreach (var key in eo.Select(kv => kv.Key).Union(ao.Select(kv => kv.Key)))
                {
                    var inE = eo.ContainsKey(key);
                    var inA = ao.ContainsKey(key);
                    if (inE != inA) return $"{path}.{key}: {(inE ? "missing in actual" : "unexpected in actual")} (expected {Show(eo[key])}, actual {Show(ao[key])})";
                    var d = Diff(eo[key], ao[key], $"{path}.{key}");
                    if (d is not null) return d;
                }
                return null;
            case JsonArray ea:
                if (actual is not JsonArray aa) return $"{path}: expected array but was {Show(actual)}";
                if (ea.Count != aa.Count) return $"{path}: expected {ea.Count} items but was {aa.Count} ({Show(actual)})";
                for (var i = 0; i < ea.Count; i++)
                {
                    var d = Diff(ea[i], aa[i], $"{path}[{i}]");
                    if (d is not null) return d;
                }
                return null;
            case JsonValue ev:
                if (actual is not JsonValue av) return $"{path}: expected {Show(expected)} but was {Show(actual)}";
                if (IsNumber(ev) && IsNumber(av))
                    return Math.Abs(ToDouble(ev) - ToDouble(av)) <= Math.Abs(ToDouble(ev)) * 1e-15 ? null : $"{path}: expected {Show(expected)} but was {Show(actual)}";
                return ev.ToJsonString() == av.ToJsonString() ? null : $"{path}: expected {Show(expected)} but was {Show(actual)}";
        }
        return null;
    }

    private static bool IsNumber(JsonValue v) => v.GetValueKind() == System.Text.Json.JsonValueKind.Number;
    private static double ToDouble(JsonValue v) => double.Parse(v.ToJsonString(), CultureInfo.InvariantCulture);
    private static string Show(JsonNode? n) => n is null ? "null" : n.ToJsonString();
}
