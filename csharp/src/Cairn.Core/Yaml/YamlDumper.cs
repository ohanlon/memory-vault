using System.Globalization;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;

namespace Cairn.Core.Yaml;

/// <summary>
/// Port of js-yaml 3.15's <c>safeDump</c> with default options (indent 2, line width 80, key order preserved).
/// gray-matter uses it to write frontmatter, so matching its output byte-for-byte keeps a note's YAML from
/// being reformatted differently by the C# build than by the Electron one.
/// </summary>
public static class YamlDumper
{
    private const int Indent = 2;
    private const int LineWidth = 80;

    private enum Style { Plain = 1, Single, Literal, Folded, Double }

    private sealed class State
    {
        public string? Tag;
        public string Dump = "";
    }

    public static string SafeDump(JsonNode? input)
    {
        var state = new State();
        return WriteNode(state, 0, input, true, true, false) ? state.Dump + "\n" : "";
    }

    private static readonly string[] DeprecatedBooleans =
    {
        "y", "Y", "yes", "Yes", "YES", "on", "On", "ON", "n", "N", "no", "No", "NO", "off", "Off", "OFF",
    };

    private static string GenerateNextLine(int level) => "\n" + new string(' ', Indent * level);

    // ---- scalar styles -------------------------------------------------------------------------

    private static bool IsWhitespace(int c) => c == 0x20 || c == 0x09;

    private static bool IsPrintable(int c) =>
        (0x00020 <= c && c <= 0x00007E)
        || ((0x000A1 <= c && c <= 0x00D7FF) && c != 0x2028 && c != 0x2029)
        || ((0x0E000 <= c && c <= 0x00FFFD) && c != 0xFEFF)
        || (0x10000 <= c && c <= 0x10FFFF);

    private static bool IsNsChar(int c) =>
        IsPrintable(c) && !IsWhitespace(c) && c != 0xFEFF && c != 0x0D && c != 0x0A;

    private static bool IsPlainSafe(int c, int? prev) =>
        IsPrintable(c) && c != 0xFEFF
        && c != ',' && c != '[' && c != ']' && c != '{' && c != '}'
        && c != ':'
        && (c != '#' || (prev is int p && p != 0 && IsNsChar(p)));

    private static bool IsPlainSafeFirst(int c) =>
        IsPrintable(c) && c != 0xFEFF && !IsWhitespace(c)
        && c != '-' && c != '?' && c != ':' && c != ',' && c != '[' && c != ']' && c != '{' && c != '}'
        && c != '#' && c != '&' && c != '*' && c != '!' && c != '|' && c != '=' && c != '>' && c != '\''
        && c != '"' && c != '%' && c != '@' && c != '`';

    private static bool NeedIndentIndicator(string s) => Regex.IsMatch(s, @"^\n* ");

    // Would this plain string be read back as null/bool/int/float/timestamp/merge?
    private static bool TestImplicitResolving(string s)
    {
        if (s is "~" or "null" or "Null" or "NULL") return true;
        if (s is "true" or "True" or "TRUE" or "false" or "False" or "FALSE") return true;
        if (s == "<<") return true;
        var resolved = YamlLoader.ResolvePlain(s);
        // Anything that doesn't come back as the same plain string was resolved to another type.
        return !(resolved is JsonValue jv && jv.GetValueKind() == JsonValueKind.String);
    }

    private static Style ChooseScalarStyle(string str, bool singleLineOnly, int indentPerLevel, int lineWidth)
    {
        var hasLineBreak = false;
        var hasFoldableLine = false;
        var shouldTrackWidth = lineWidth != -1;
        var previousLineBreak = -1;
        var plain = IsPlainSafeFirst(str[0]) && !IsWhitespace(str[^1]);
        int i;

        if (singleLineOnly)
        {
            for (i = 0; i < str.Length; i++)
            {
                int ch = str[i];
                if (!IsPrintable(ch)) return Style.Double;
                int? prev = i > 0 ? str[i - 1] : null;
                plain = plain && IsPlainSafe(ch, prev);
            }
        }
        else
        {
            for (i = 0; i < str.Length; i++)
            {
                int ch = str[i];
                if (ch == 0x0A)
                {
                    hasLineBreak = true;
                    if (shouldTrackWidth)
                    {
                        hasFoldableLine = hasFoldableLine
                            || (i - previousLineBreak - 1 > lineWidth && str[previousLineBreak + 1] != ' ');
                        previousLineBreak = i;
                    }
                }
                else if (!IsPrintable(ch))
                {
                    return Style.Double;
                }
                int? prev = i > 0 ? str[i - 1] : null;
                plain = plain && IsPlainSafe(ch, prev);
            }
            hasFoldableLine = hasFoldableLine || (shouldTrackWidth
                && i - previousLineBreak - 1 > lineWidth
                && (previousLineBreak + 1 >= str.Length || str[previousLineBreak + 1] != ' '));
        }

        if (!hasLineBreak && !hasFoldableLine)
            return plain && !TestImplicitResolving(str) ? Style.Plain : Style.Single;
        if (indentPerLevel > 9 && NeedIndentIndicator(str)) return Style.Double;
        return hasFoldableLine ? Style.Folded : Style.Literal;
    }

    private static string WriteScalar(string str, int level, bool isKey)
    {
        if (str.Length == 0) return "''";
        if (Array.IndexOf(DeprecatedBooleans, str) >= 0) return "'" + str + "'";

        var indent = Indent * Math.Max(1, level);
        var lineWidth = Math.Max(Math.Min(LineWidth, 40), LineWidth - indent);
        var singleLineOnly = isKey;

        switch (ChooseScalarStyle(str, singleLineOnly, Indent, lineWidth))
        {
            case Style.Plain:
                return str;
            case Style.Single:
                return "'" + str.Replace("'", "''") + "'";
            case Style.Literal:
                return "|" + BlockHeader(str, Indent) + DropEndingNewline(IndentString(str, indent));
            case Style.Folded:
                return ">" + BlockHeader(str, Indent)
                    + DropEndingNewline(IndentString(FoldString(str, lineWidth), indent));
            default:
                return "\"" + EscapeString(str) + "\"";
        }
    }

    private static string IndentString(string str, int spaces)
    {
        var ind = new string(' ', spaces);
        var sb = new StringBuilder();
        var position = 0;
        while (position < str.Length)
        {
            var next = str.IndexOf('\n', position);
            string line;
            if (next == -1)
            {
                line = str[position..];
                position = str.Length;
            }
            else
            {
                line = str[position..(next + 1)];
                position = next + 1;
            }
            if (line.Length > 0 && line != "\n") sb.Append(ind);
            sb.Append(line);
        }
        return sb.ToString();
    }

    private static string BlockHeader(string str, int indentPerLevel)
    {
        var indentIndicator = NeedIndentIndicator(str) ? indentPerLevel.ToString(CultureInfo.InvariantCulture) : "";
        var clip = str[^1] == '\n';
        var keep = clip && ((str.Length >= 2 && str[^2] == '\n') || str == "\n");
        var chomp = keep ? "+" : (clip ? "" : "-");
        return indentIndicator + chomp + "\n";
    }

    private static string DropEndingNewline(string s) => s.Length > 0 && s[^1] == '\n' ? s[..^1] : s;

    private static string FoldString(string str, int width)
    {
        var lineRe = new Regex(@"(\n+)([^\n]*)", RegexOptions.CultureInvariant);

        var nextLf = str.IndexOf('\n');
        if (nextLf == -1) nextLf = str.Length;
        var result = new StringBuilder(FoldLine(str[..nextLf], width));
        var prevMoreIndented = str[0] == '\n' || str[0] == ' ';

        var match = lineRe.Match(str, nextLf);
        while (match.Success)
        {
            var prefix = match.Groups[1].Value;
            var line = match.Groups[2].Value;
            var moreIndented = line.Length > 0 && line[0] == ' ';
            result.Append(prefix);
            if (!prevMoreIndented && !moreIndented && line != "") result.Append('\n');
            result.Append(FoldLine(line, width));
            prevMoreIndented = moreIndented;
            match = match.NextMatch();
        }
        return result.ToString();
    }

    private static string FoldLine(string line, int width)
    {
        if (line == "" || line[0] == ' ') return line;

        var breakRe = new Regex(" [^ ]", RegexOptions.CultureInvariant);
        int start = 0, curr = 0, next = 0, end;
        var result = new StringBuilder();

        for (var match = breakRe.Match(line); match.Success; match = match.NextMatch())
        {
            next = match.Index;
            if (next - start > width)
            {
                end = curr > start ? curr : next;
                result.Append('\n').Append(line, start, end - start);
                start = end + 1;
            }
            curr = next;
        }

        result.Append('\n');
        if (line.Length - start > width && curr > start)
            result.Append(line, start, curr - start).Append('\n').Append(line[(curr + 1)..]);
        else
            result.Append(line[start..]);

        return result.ToString()[1..];
    }

    private static string EscapeString(string str)
    {
        var sb = new StringBuilder();
        for (var i = 0; i < str.Length; i++)
        {
            int ch = str[i];
            if (ch >= 0xD800 && ch <= 0xDBFF && i + 1 < str.Length)
            {
                int nextCh = str[i + 1];
                if (nextCh >= 0xDC00 && nextCh <= 0xDFFF)
                {
                    sb.Append(EncodeHex((ch - 0xD800) * 0x400 + nextCh - 0xDC00 + 0x10000));
                    i++;
                    continue;
                }
            }
            var seq = EscapeSequence(ch);
            if (seq is null && IsPrintable(ch)) sb.Append(str[i]);
            else sb.Append(seq ?? EncodeHex(ch));
        }
        return sb.ToString();
    }

    private static string? EscapeSequence(int c) => c switch
    {
        0x00 => "\\0", 0x07 => "\\a", 0x08 => "\\b", 0x09 => "\\t", 0x0A => "\\n", 0x0B => "\\v",
        0x0C => "\\f", 0x0D => "\\r", 0x1B => "\\e", 0x22 => "\\\"", 0x5C => "\\\\", 0x85 => "\\N",
        0xA0 => "\\_", 0x2028 => "\\L", 0x2029 => "\\P", _ => null,
    };

    private static string EncodeHex(int c)
    {
        var s = c.ToString("X", CultureInfo.InvariantCulture);
        if (c <= 0xFF) return "\\x" + s.PadLeft(2, '0');
        if (c <= 0xFFFF) return "\\u" + s.PadLeft(4, '0');
        return "\\U" + s.PadLeft(8, '0');
    }

    // ---- structure -----------------------------------------------------------------------------

    private static void WriteFlowSequence(State state, int level, JsonArray array)
    {
        var result = new StringBuilder();
        var tag = state.Tag;
        for (var index = 0; index < array.Count; index++)
        {
            if (WriteNode(state, level, array[index], false, false, false))
            {
                if (index != 0) result.Append(", ");
                result.Append(state.Dump);
            }
        }
        state.Tag = tag;
        state.Dump = "[" + result + "]";
    }

    private static void WriteBlockSequence(State state, int level, JsonArray array, bool compact)
    {
        var result = new StringBuilder();
        var tag = state.Tag;
        for (var index = 0; index < array.Count; index++)
        {
            if (WriteNode(state, level + 1, array[index], true, true, false))
            {
                if (!compact || index != 0) result.Append(GenerateNextLine(level));
                if (state.Dump.Length > 0 && state.Dump[0] == '\n') result.Append('-');
                else result.Append("- ");
                result.Append(state.Dump);
            }
        }
        state.Tag = tag;
        state.Dump = result.Length > 0 ? result.ToString() : "[]";
    }

    private static void WriteFlowMapping(State state, int level, JsonObject obj)
    {
        var result = new StringBuilder();
        var tag = state.Tag;
        var index = 0;
        foreach (var (key, value) in obj.ToList())
        {
            var pair = new StringBuilder();
            if (index != 0) pair.Append(", ");
            index++;

            if (!WriteNode(state, level, JsonValue.Create(key), false, false, false)) continue;
            if (state.Dump.Length > 1024) pair.Append("? ");
            pair.Append(state.Dump).Append(": ");

            if (!WriteNode(state, level, value, false, false, false)) continue;
            pair.Append(state.Dump);
            result.Append(pair);
        }
        state.Tag = tag;
        state.Dump = "{" + result + "}";
    }

    private static void WriteBlockMapping(State state, int level, JsonObject obj, bool compact)
    {
        var result = new StringBuilder();
        var tag = state.Tag;
        var index = 0;
        foreach (var (key, value) in obj.ToList())
        {
            var pair = new StringBuilder();
            if (!compact || index != 0) pair.Append(GenerateNextLine(level));
            index++;

            if (!WriteNode(state, level + 1, JsonValue.Create(key), true, true, true)) continue;

            var explicitPair = (state.Tag is not null && state.Tag != "?") || state.Dump.Length > 1024;
            if (explicitPair)
            {
                if (state.Dump.Length > 0 && state.Dump[0] == '\n') pair.Append('?');
                else pair.Append("? ");
            }
            pair.Append(state.Dump);
            if (explicitPair) pair.Append(GenerateNextLine(level));

            if (!WriteNode(state, level + 1, value, true, explicitPair, false)) continue;

            if (state.Dump.Length > 0 && state.Dump[0] == '\n') pair.Append(':');
            else pair.Append(": ");
            pair.Append(state.Dump);
            result.Append(pair);
        }
        state.Tag = tag;
        state.Dump = result.Length > 0 ? result.ToString() : "{}";
    }

    private static bool WriteNode(State state, int level, JsonNode? node, bool block, bool compact, bool isKey)
    {
        state.Tag = null;

        // Implicit types (null/bool/number/timestamp) are rendered up front, like js-yaml's detectType.
        string? represented = null;
        switch (node)
        {
            case null:
                represented = "null";
                break;
            case JsonObject o when YamlDate.IsDate(o, out var iso):
                represented = iso;
                break;
            case JsonValue v:
                switch (v.GetValueKind())
                {
                    case JsonValueKind.True: represented = "true"; break;
                    case JsonValueKind.False: represented = "false"; break;
                    case JsonValueKind.Null: represented = "null"; break;
                    case JsonValueKind.Number: represented = RepresentNumber(ToDouble(v)); break;
                }
                break;
        }
        if (represented is not null)
        {
            state.Tag = "?";
            state.Dump = represented;
            return true;
        }

        if (node is JsonObject obj)
        {
            if (block && obj.Count != 0) WriteBlockMapping(state, level, obj, compact);
            else WriteFlowMapping(state, level, obj);
            return true;
        }
        if (node is JsonArray arr)
        {
            if (block && arr.Count != 0) WriteBlockSequence(state, level, arr, compact);
            else WriteFlowSequence(state, level, arr);
            return true;
        }
        if (node is JsonValue sv && sv.GetValueKind() == JsonValueKind.String)
        {
            state.Dump = WriteScalar(sv.GetValue<string>(), level, isKey);
            return true;
        }
        return false;
    }

    internal static double ToDouble(JsonValue v)
    {
        if (v.TryGetValue<double>(out var d)) return d;
        if (v.TryGetValue<long>(out var l)) return l;
        if (v.TryGetValue<int>(out var i)) return i;
        if (v.TryGetValue<decimal>(out var m)) return (double)m;
        return v.GetValue<JsonElement>().GetDouble();
    }

    private static string RepresentNumber(double d)
    {
        if (double.IsNaN(d)) return ".nan";
        if (double.IsPositiveInfinity(d)) return ".inf";
        if (double.IsNegativeInfinity(d)) return "-.inf";
        if (d == 0 && double.IsNegative(d)) return "-0.0";
        var s = JsNumber.ToString(d);
        if (d % 1 == 0) return s; // integers are written as-is, even in exponent form (1e+21)
        // YAML needs a dot in float exponent forms: 5e-100 -> 5.e-100.
        return Regex.IsMatch(s, @"^[-+]?[0-9]+e") ? s.Replace("e", ".e") : s;
    }
}
