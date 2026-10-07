using System.Text.RegularExpressions;

namespace Cairn.Core.Shared;

/// <summary>Port of shared/dateFormat.ts: a small token-based date/time pattern language (YYYY-MM-DD, HH:mm, [literal], ...).</summary>
public static class DateFormat
{
    private static readonly string[] MonthsLong =
    {
        "January", "February", "March", "April", "May", "June",
        "July", "August", "September", "October", "November", "December",
    };

    private static readonly string[] WeekdaysLong = { "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday" };

    // Bracketed text is matched first so it passes through literally; longer tokens precede their prefixes.
    private static readonly Regex TokenRe = new(
        @"\[[^\]]*\]|YYYY|YY|MMMM|MMM|MM|M|dddd|ddd|DD|D|HH|H|hh|h|mm|m|ss|s|A|a", RegexOptions.CultureInvariant);

    private const int MaxPatternLength = 64;
    private static readonly Regex InvalidPatternChars = new(@"[*?""<>|\x00-\x1f]", RegexOptions.CultureInvariant);

    private static string Pad(int n) => n.ToString("D2", System.Globalization.CultureInfo.InvariantCulture);
    private static string Num(int n) => n.ToString(System.Globalization.CultureInfo.InvariantCulture);

    public static string Format(DateTime date, string pattern)
    {
        var hours24 = date.Hour;
        return TokenRe.Replace(pattern, m =>
        {
            var token = m.Value;
            if (token[0] == '[') return token[1..^1];
            return token switch
            {
                "YYYY" => Num(date.Year),
                "YY" => Pad(date.Year % 100),
                "MMMM" => MonthsLong[date.Month - 1],
                "MMM" => MonthsLong[date.Month - 1][..3],
                "MM" => Pad(date.Month),
                "M" => Num(date.Month),
                "dddd" => WeekdaysLong[(int)date.DayOfWeek],
                "ddd" => WeekdaysLong[(int)date.DayOfWeek][..3],
                "DD" => Pad(date.Day),
                "D" => Num(date.Day),
                "HH" => Pad(hours24),
                "H" => Num(hours24),
                "hh" => Pad((hours24 + 11) % 12 + 1),
                "h" => Num((hours24 + 11) % 12 + 1),
                "mm" => Pad(date.Minute),
                "m" => Num(date.Minute),
                "ss" => Pad(date.Second),
                "s" => Num(date.Second),
                "A" => hours24 < 12 ? "AM" : "PM",
                "a" => hours24 < 12 ? "am" : "pm",
                _ => token,
            };
        });
    }

    /// <summary>A pattern is valid if it is non-empty, not absurdly long, and free of characters that could never belong in a rendered date.</summary>
    public static bool IsValid(string pattern)
    {
        var trimmed = pattern.Trim();
        return trimmed.Length > 0 && trimmed.Length <= MaxPatternLength && !InvalidPatternChars.IsMatch(trimmed);
    }
}
