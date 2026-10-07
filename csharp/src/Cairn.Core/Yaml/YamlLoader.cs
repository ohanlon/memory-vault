using System.Globalization;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;
using YamlDotNet.Core;
using YamlDotNet.RepresentationModel;

namespace Cairn.Core.Yaml;

/// <summary>
/// Parses YAML into a <see cref="JsonNode"/> tree the way js-yaml 3's <c>safeLoad</c> (the engine behind
/// gray-matter) does: plain scalars are resolved with js-yaml's core schema plus timestamps, which become
/// date markers (see <see cref="YamlDate"/>).
/// </summary>
public static class YamlLoader
{
    /// <summary>Returns null for an empty document. Throws <see cref="YamlException"/> on malformed YAML.</summary>
    public static JsonNode? Load(string text)
    {
        // js-yaml normalizes its input: a document without a trailing newline gets one (it affects "|" and ">" scalars).
        if (text.Length > 0 && text[text.Length - 1] != (char)10 && text[text.Length - 1] != (char)13) text += (char)10;
        var stream = new YamlStream();
        stream.Load(new StringReader(text));
        if (stream.Documents.Count == 0) return null;
        if (stream.Documents.Count > 1)
            throw new YamlException("expected a single document in the stream, but found more");
        return Convert(stream.Documents[0].RootNode);
    }

    private static JsonNode? Convert(YamlNode node)
    {
        switch (node)
        {
            case YamlScalarNode scalar:
                return ConvertScalar(scalar);
            case YamlSequenceNode seq:
                var arr = new JsonArray();
                foreach (var child in seq.Children) arr.Add(Convert(child));
                return arr;
            case YamlMappingNode map:
                var obj = new JsonObject();
                YamlNode? merge = null;
                foreach (var (k, v) in map.Children)
                {
                    if (k is YamlScalarNode ks && IsPlain(ks) && ks.Value == "<<")
                    {
                        merge = v;
                        continue;
                    }
                    obj[KeyToString(k)] = Convert(v);
                }
                if (merge is not null) ApplyMerge(obj, Convert(merge));
                return obj;
            default:
                return null;
        }
    }

    private static void ApplyMerge(JsonObject target, JsonNode? source)
    {
        // Explicit keys win over merged ones; with a list of maps, earlier maps win over later ones.
        if (source is JsonObject so)
        {
            foreach (var (k, v) in so)
                if (!target.ContainsKey(k)) target[k] = v?.DeepClone();
        }
        else if (source is JsonArray sa)
        {
            foreach (var item in sa) ApplyMerge(target, item);
        }
    }

    private static string KeyToString(YamlNode key)
    {
        if (key is YamlScalarNode s)
        {
            var resolved = ConvertScalar(s);
            return resolved switch
            {
                null => "null",
                JsonObject o when YamlDate.IsDate(o, out var iso) => iso,
                JsonValue jv when jv.TryGetValue<string>(out var str) => str,
                JsonValue jv when jv.TryGetValue<bool>(out var b) => b ? "true" : "false",
                JsonValue jv when jv.TryGetValue<long>(out var l) => l.ToString(CultureInfo.InvariantCulture),
                JsonValue jv when jv.TryGetValue<double>(out var d) => JsNumber.ToString(d),
                _ => s.Value ?? "",
            };
        }
        return key.ToString();
    }

    private static bool IsPlain(YamlScalarNode s) => s.Style == ScalarStyle.Plain && s.Tag.IsEmpty;

    private static JsonNode? ConvertScalar(YamlScalarNode scalar)
    {
        var value = scalar.Value ?? "";
        var tag = scalar.Tag.IsEmpty ? null : scalar.Tag.Value;
        if (tag == "tag:yaml.org,2002:str" || tag == "!!str") return JsonValue.Create(value);
        if (scalar.Style != ScalarStyle.Plain) return JsonValue.Create(value);
        return ResolvePlain(value);
    }

    private static readonly Regex FloatPattern = new(
        @"^(?:[-+]?(?:0|[1-9][0-9_]*)(?:\.[0-9_]*)?(?:[eE][-+]?[0-9]+)?" +
        @"|\.[0-9_]+(?:[eE][-+]?[0-9]+)?" +
        @"|[-+]?[0-9][0-9_]*(?::[0-5]?[0-9])+\.[0-9_]*" +
        @"|[-+]?\.(?:inf|Inf|INF)" +
        @"|\.(?:nan|NaN|NAN))\z", RegexOptions.CultureInvariant);

    private static readonly Regex DatePattern = new(
        @"^([0-9][0-9][0-9][0-9])-([0-9][0-9])-([0-9][0-9])\z", RegexOptions.CultureInvariant);

    private static readonly Regex TimestampPattern = new(
        @"^([0-9][0-9][0-9][0-9])-([0-9][0-9]?)-([0-9][0-9]?)(?:[Tt]|[ \t]+)([0-9][0-9]?):([0-9][0-9]):([0-9][0-9])" +
        @"(?:\.([0-9]*))?(?:[ \t]*(Z|([-+])([0-9][0-9]?)(?::([0-9][0-9]))?))?\z", RegexOptions.CultureInvariant);

    private static readonly Regex Base60Tail = new(@"^(:[0-5]?[0-9])+\z", RegexOptions.CultureInvariant);

    public static JsonNode? ResolvePlain(string data)
    {
        if (data.Length == 0 || data is "~" or "null" or "Null" or "NULL") return null;
        if (data is "true" or "True" or "TRUE") return JsonValue.Create(true);
        if (data is "false" or "False" or "FALSE") return JsonValue.Create(false);
        if (IsInteger(data)) return NumberNode(ConstructInteger(data));
        if (FloatPattern.IsMatch(data) && data[^1] != '_') return NumberNode(ConstructFloat(data));
        if (DatePattern.IsMatch(data) || TimestampPattern.IsMatch(data)) return ConstructTimestamp(data);
        return JsonValue.Create(data);
    }

    private static JsonNode? NumberNode(double d)
    {
        // JSON can't carry NaN/Infinity; JSON.stringify turns them into null.
        if (double.IsNaN(d) || double.IsInfinity(d)) return null;
        if (d == Math.Floor(d) && Math.Abs(d) < 9e15) return JsonValue.Create((long)d);
        return JsonValue.Create(d);
    }

    private static bool IsInteger(string data)
    {
        var max = data.Length;
        var index = 0;
        var hasDigits = false;
        if (max == 0) return false;
        var ch = data[index];
        if (ch is '-' or '+') ch = index + 1 < max ? data[++index] : '\0';
        if (ch == '0')
        {
            if (index + 1 == max) return true;
            ch = data[++index];
            if (ch == 'b')
            {
                index++;
                for (; index < max; index++)
                {
                    ch = data[index];
                    if (ch == '_') continue;
                    if (ch != '0' && ch != '1') return false;
                    hasDigits = true;
                }
                return hasDigits && ch != '_';
            }
            if (ch == 'x')
            {
                index++;
                for (; index < max; index++)
                {
                    ch = data[index];
                    if (ch == '_') continue;
                    if (!Uri.IsHexDigit(ch)) return false;
                    hasDigits = true;
                }
                return hasDigits && ch != '_';
            }
            for (; index < max; index++)
            {
                ch = data[index];
                if (ch == '_') continue;
                if (ch < '0' || ch > '7') return false;
                hasDigits = true;
            }
            return hasDigits && ch != '_';
        }
        if (ch == '_') return false;
        for (; index < max; index++)
        {
            ch = data[index];
            if (ch == '_') continue;
            if (ch == ':') break;
            if (ch < '0' || ch > '9') return false;
            hasDigits = true;
        }
        if (!hasDigits || ch == '_') return false;
        if (ch != ':') return true;
        return Base60Tail.IsMatch(data[index..]);
    }

    private static double ConstructInteger(string data)
    {
        var value = data.Replace("_", "");
        var sign = 1;
        var ch = value[0];
        if (ch is '-' or '+')
        {
            if (ch == '-') sign = -1;
            value = value[1..];
            ch = value.Length > 0 ? value[0] : '\0';
        }
        if (value == "0") return 0;
        if (ch == '0')
        {
            if (value.Length > 1 && value[1] == 'b') return sign * ParseRadix(value[2..], 2);
            if (value.Length > 1 && value[1] == 'x') return sign * ParseRadix(value[2..], 16);
            return sign * ParseRadix(value, 8);
        }
        if (value.Contains(':')) return sign * Base60(value);
        return sign * double.Parse(value, CultureInfo.InvariantCulture);
    }

    private static double Base60(string value)
    {
        double total = 0, b = 1;
        var parts = value.Split(':');
        for (var i = parts.Length - 1; i >= 0; i--)
        {
            total += double.Parse(parts[i], CultureInfo.InvariantCulture) * b;
            b *= 60;
        }
        return total;
    }

    private static double ParseRadix(string digits, int radix)
    {
        double result = 0;
        foreach (var c in digits) result = result * radix + System.Convert.ToInt32(c.ToString(), 16);
        return result;
    }

    private static double ConstructFloat(string data)
    {
        var value = data.Replace("_", "").ToLowerInvariant();
        var sign = value[0] == '-' ? -1 : 1;
        if (value[0] is '+' or '-') value = value[1..];
        if (value == ".inf") return sign == 1 ? double.PositiveInfinity : double.NegativeInfinity;
        if (value == ".nan") return double.NaN;
        if (value.Contains(':')) return sign * Base60(value);
        return sign * double.Parse(value, NumberStyles.Float, CultureInfo.InvariantCulture);
    }

    private static JsonNode ConstructTimestamp(string data)
    {
        var m = DatePattern.Match(data);
        if (!m.Success) m = TimestampPattern.Match(data);

        var year = int.Parse(m.Groups[1].Value, CultureInfo.InvariantCulture);
        var month = int.Parse(m.Groups[2].Value, CultureInfo.InvariantCulture);
        var day = int.Parse(m.Groups[3].Value, CultureInfo.InvariantCulture);

        if (!m.Groups[4].Success || m.Groups[4].Value.Length == 0)
            return YamlDate.Create(UtcDate(year, month, day, 0, 0, 0, 0));

        var hour = int.Parse(m.Groups[4].Value, CultureInfo.InvariantCulture);
        var minute = int.Parse(m.Groups[5].Value, CultureInfo.InvariantCulture);
        var second = int.Parse(m.Groups[6].Value, CultureInfo.InvariantCulture);
        var fraction = 0;
        if (m.Groups[7].Success && m.Groups[7].Value.Length > 0)
        {
            var f = m.Groups[7].Value;
            f = f.Length > 3 ? f[..3] : f.PadRight(3, '0');
            fraction = int.Parse(f, CultureInfo.InvariantCulture);
        }
        var date = UtcDate(year, month, day, hour, minute, second, fraction);
        if (m.Groups[9].Success && m.Groups[9].Value.Length > 0)
        {
            var tzHour = int.Parse(m.Groups[10].Value, CultureInfo.InvariantCulture);
            var tzMinute = m.Groups[11].Success ? int.Parse(m.Groups[11].Value, CultureInfo.InvariantCulture) : 0;
            var delta = TimeSpan.FromMinutes(tzHour * 60 + tzMinute);
            if (m.Groups[9].Value == "-") delta = -delta;
            date -= delta;
        }
        return YamlDate.Create(date);
    }

    // Date.UTC rolls out-of-range fields over (e.g. month 13 -> next year); mimic that rather than throwing.
    private static DateTime UtcDate(int year, int month, int day, int hour, int minute, int second, int ms)
    {
        var baseDate = new DateTime(year, 1, 1, 0, 0, 0, DateTimeKind.Utc);
        return baseDate.AddMonths(month - 1).AddDays(day - 1).AddHours(hour).AddMinutes(minute)
            .AddSeconds(second).AddMilliseconds(ms);
    }
}
