using System.Text.RegularExpressions;

namespace Cairn.Core.Shared;

/// <summary>Port of shared/folderDirName.ts: turns a typed notes folder name into one safe directory name.</summary>
public static class FolderDirName
{
    private static readonly Regex Illegal = new("[<>:\"/\\\\|?*\\u0000-\\u001f]", RegexOptions.Compiled);
    private static readonly Regex WindowsReserved = new("^(con|prn|aux|nul|com[1-9]|lpt[1-9])$", RegexOptions.Compiled | RegexOptions.IgnoreCase);

    public static string Sanitize(string name)
    {
        var cleaned = Illegal.Replace(name, "-").Trim().TrimStart('.').TrimEnd('.', ' ');
        if (cleaned.Length == 0 || WindowsReserved.IsMatch(cleaned.Split('.')[0])) return "Untitled";
        return cleaned;
    }

    /// <summary><paramref name="baseName"/>, or <c>base-2</c>, <c>base-3</c>... — the first one <paramref name="isTaken"/> doesn't claim.</summary>
    public static string Unique(string baseName, Func<string, bool> isTaken)
    {
        var candidate = baseName;
        for (var n = 2; isTaken(candidate); n++) candidate = $"{baseName}-{n}";
        return candidate;
    }
}
