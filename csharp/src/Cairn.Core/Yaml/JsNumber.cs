using System.Globalization;
using System.Text;

namespace Cairn.Core.Yaml;

/// <summary>ECMAScript <c>Number::toString</c> formatting, so numbers round-trip exactly as Node would print them.</summary>
public static class JsNumber
{
    public static string ToString(double v)
    {
        if (double.IsNaN(v)) return "NaN";
        if (v == 0) return "0";
        if (double.IsPositiveInfinity(v)) return "Infinity";
        if (double.IsNegativeInfinity(v)) return "-Infinity";

        var sign = v < 0 ? "-" : "";
        v = Math.Abs(v);

        // Shortest round-trip digits; value = 0.DIGITS * 10^n.
        var (digits, n) = ParseDigits(v.ToString("R", CultureInfo.InvariantCulture));

        var k = digits.Length;
        var sb = new StringBuilder(sign);
        if (k <= n && n <= 21)
        {
            sb.Append(digits).Append('0', n - k);
        }
        else if (0 < n && n <= 21)
        {
            sb.Append(digits, 0, n).Append('.').Append(digits, n, k - n);
        }
        else if (-6 < n && n <= 0)
        {
            sb.Append("0.").Append('0', -n).Append(digits);
        }
        else
        {
            var e = n - 1;
            sb.Append(digits[0]);
            if (k > 1) sb.Append('.').Append(digits, 1, k - 1);
            sb.Append('e').Append(e < 0 ? '-' : '+').Append(Math.Abs(e).ToString(CultureInfo.InvariantCulture));
        }
        return sb.ToString();
    }

    private static (string Digits, int N) ParseDigits(string s)
    {
        var exp = 0;
        var ePos = s.IndexOfAny(new[] { 'E', 'e' });
        if (ePos >= 0)
        {
            exp = int.Parse(s[(ePos + 1)..], NumberStyles.AllowLeadingSign, CultureInfo.InvariantCulture);
            s = s[..ePos];
        }
        var dot = s.IndexOf('.');
        var intPart = dot >= 0 ? s[..dot] : s;
        var fracPart = dot >= 0 ? s[(dot + 1)..] : "";
        var all = intPart + fracPart;
        var pointPos = intPart.Length + exp;
        var lead = 0;
        while (lead < all.Length - 1 && all[lead] == '0') lead++;
        all = all[lead..];
        pointPos -= lead;
        all = all.TrimEnd('0');
        if (all.Length == 0) all = "0";
        return (all, pointPos);
    }
}
