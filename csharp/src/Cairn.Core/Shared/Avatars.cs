namespace Cairn.Core.Shared;

/// <summary>Port of the deterministic avatar assignment in shared/avatars.ts.</summary>
public static class Avatars
{
    public const int NotesFolderAvatarCount = 12;

    /// <summary>Deterministic djb2-style hash to a stable index in [0, count).</summary>
    public static int DefaultIndexForName(string name, int count)
    {
        var hash = 5381;
        foreach (var c in name) hash = unchecked((hash << 5) + hash + c); // 32-bit wrap, like JS's "| 0"
        return (int)(Math.Abs((long)hash) % count);
    }
}
