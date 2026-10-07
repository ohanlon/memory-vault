using System.Globalization;
using System.Text.Json.Nodes;

namespace Cairn.Core.Yaml;

/// <summary>
/// js-yaml turns YAML timestamps into JS <c>Date</c> objects, which behave differently from plain strings
/// both when sent over IPC (structured clone keeps the Date) and when dumped back to YAML (unquoted ISO).
/// A date is therefore carried through the JSON tree as <c>{"__cairnDate": "&lt;ISO 8601&gt;"}</c>; the IPC
/// bridge revives it into a real <c>Date</c> and the on-disk caches flatten it to the ISO string, exactly as
/// <c>JSON.stringify</c> does for a Date.
/// </summary>
public static class YamlDate
{
    public const string Marker = "__cairnDate";

    public static JsonObject Create(DateTime utc)
    {
        return new JsonObject { [Marker] = JsToIso(utc) };
    }

    public static bool IsDate(JsonNode? node, out string iso)
    {
        iso = "";
        if (node is JsonObject o && o.Count == 1 && o.TryGetPropertyValue(Marker, out var v)
            && v is JsonValue jv && jv.TryGetValue<string>(out var s))
        {
            iso = s;
            return true;
        }
        return false;
    }

    /// <summary>Equivalent of <c>Date.prototype.toISOString</c> (always UTC, millisecond precision).</summary>
    public static string JsToIso(DateTime utc)
    {
        var u = utc.Kind == DateTimeKind.Utc ? utc : utc.ToUniversalTime();
        var year = u.Year;
        var yearText = year is >= 0 and <= 9999
            ? year.ToString("D4", CultureInfo.InvariantCulture)
            : (year < 0 ? "-" : "+") + Math.Abs(year).ToString("D6", CultureInfo.InvariantCulture);
        return string.Create(CultureInfo.InvariantCulture,
            $"{yearText}-{u.Month:D2}-{u.Day:D2}T{u.Hour:D2}:{u.Minute:D2}:{u.Second:D2}.{u.Millisecond:D3}Z");
    }

    /// <summary>Replaces every date marker in the tree with its ISO string (what <c>JSON.stringify</c> produces).</summary>
    public static JsonNode? Flatten(JsonNode? node)
    {
        switch (node)
        {
            case null:
                return null;
            case JsonObject o:
                if (IsDate(o, out var iso)) return JsonValue.Create(iso);
                var copy = new JsonObject();
                foreach (var (k, v) in o) copy[k] = Flatten(v);
                return copy;
            case JsonArray a:
                var arr = new JsonArray();
                foreach (var item in a) arr.Add(Flatten(item));
                return arr;
            default:
                return node.DeepClone();
        }
    }
}
