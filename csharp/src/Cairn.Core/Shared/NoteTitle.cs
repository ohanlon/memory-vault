using System.Text.RegularExpressions;

namespace Cairn.Core.Shared;

/// <summary>Port of shared/noteTitle.ts.</summary>
public static class NoteTitle
{
    // A "/" or "\" would let a title escape its directory once ".md" is appended, so it is rejected
    // alongside the characters Windows (the most restrictive platform) disallows in a filename.
    private static readonly Regex InvalidChars = new(@"[\\/:*?""<>|\x00-\x1f]", RegexOptions.CultureInvariant);

    /// <summary>An error message if <paramref name="title"/> (already trimmed) can't be a note/folder filename, else null.</summary>
    public static string? InvalidReason(string title)
    {
        if (title.Length == 0) return "Name cannot be empty";
        if (InvalidChars.IsMatch(title)) return "Name cannot contain any of: \\ / : * ? \" < > |";
        return null;
    }
}
