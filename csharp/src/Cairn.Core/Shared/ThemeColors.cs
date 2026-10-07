using System.Text.RegularExpressions;

namespace Cairn.Core.Shared;

/// <summary>Port of the helpers in shared/themeColors.ts (the palettes themselves are generated into <see cref="SharedData"/>).</summary>
public static class ThemeColors
{
    private static readonly Regex HexColor = new(@"^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})\z", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant);
    private static readonly Regex FunctionalColor = new(@"^(rgb|rgba|hsl|hsla)\([^)]+\)\z", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant);

    public static IReadOnlyDictionary<string, string> DefaultsFor(string baseMode) =>
        baseMode == "light" ? SharedData.DefaultLightColors : SharedData.DefaultDarkColors;

    /// <summary>Syntax-only validation: hex (3/4/6/8 digits), rgb()/rgba()/hsl()/hsla(), transparent, currentColor.</summary>
    public static bool IsValidCssColor(string value)
    {
        var trimmed = value.Trim();
        if (trimmed.Length == 0) return false;
        if (HexColor.IsMatch(trimmed) || FunctionalColor.IsMatch(trimmed)) return true;
        var lower = trimmed.ToLowerInvariant();
        return lower is "transparent" or "currentcolor";
    }
}
