using System.Text;

namespace Cairn.Core.Markdown;

/// <summary>Strict <c>decodeURIComponent</c>: unlike <see cref="Uri.UnescapeDataString"/>, malformed input is rejected rather than half-decoded.</summary>
public static class JsUri
{
    /// <summary>Returns null where JavaScript would throw a URIError.</summary>
    public static string? TryDecodeComponent(string s)
    {
        if (s.IndexOf('%') < 0) return s;
        var result = new StringBuilder();
        var strict = new UTF8Encoding(false, throwOnInvalidBytes: true);
        var i = 0;
        while (i < s.Length)
        {
            if (s[i] != '%')
            {
                result.Append(s[i++]);
                continue;
            }

            var bytes = new List<byte>();
            while (i < s.Length && s[i] == '%')
            {
                if (i + 2 >= s.Length) return null;
                if (!Uri.IsHexDigit(s[i + 1]) || !Uri.IsHexDigit(s[i + 2])) return null;
                bytes.Add(Convert.ToByte(s.Substring(i + 1, 2), 16));
                i += 3;
                // A multi-byte sequence ends once its declared length has been consumed.
                if (IsComplete(bytes)) break;
            }
            try
            {
                result.Append(strict.GetString(bytes.ToArray()));
            }
            catch (ArgumentException)
            {
                return null;
            }
        }
        return result.ToString();
    }

    private static bool IsComplete(List<byte> bytes)
    {
        var first = bytes[0];
        var needed = first < 0x80 ? 1 : first >= 0xF0 ? 4 : first >= 0xE0 ? 3 : first >= 0xC0 ? 2 : 1;
        return bytes.Count >= needed;
    }
}
