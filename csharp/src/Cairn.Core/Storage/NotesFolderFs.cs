using Cairn.Core.Markdown;
using Cairn.Core.Models;
using Cairn.Core.Shared;

namespace Cairn.Core.Storage;

/// <summary>Port of electron/notesFolder.ts: walking a notes folder, parsing its notes, and naming/renaming files.</summary>
public static class NotesFolderFs
{
    private static bool IsLink(FileSystemInfo info) => info.LinkTarget is not null;

    private static void WalkDir(string dir, List<string> output)
    {
        foreach (var entry in new DirectoryInfo(dir).EnumerateFileSystemInfos().ToList())
        {
            if (entry.Name.StartsWith('.')) continue;
            // Like Node's Dirent, symlinks are neither directories nor files here, so they're skipped.
            if (IsLink(entry)) continue;
            if (entry is DirectoryInfo)
                WalkDir(entry.FullName, output);
            else if (entry.Name.EndsWith(".md", StringComparison.OrdinalIgnoreCase))
                output.Add(entry.FullName);
        }
    }

    /// <summary>All markdown files under root, excluding dotfolders (e.g. .cairn) and dotfiles.</summary>
    public static List<string> ListMarkdownFiles(string root)
    {
        var output = new List<string>();
        WalkDir(root, output);
        return output;
    }

    /// <summary>dir/title.md, or "title 2.md", "title 3.md", ... incrementing past whatever already exists.</summary>
    public static string UniqueNotePath(string dir, string title)
    {
        var fullPath = Path.Combine(dir, $"{title}.md");
        var n = 0;
        while (Exists(fullPath))
        {
            n++;
            fullPath = Path.Combine(dir, $"{title} {n}.md");
        }
        return fullPath;
    }

    /// <summary>dir/name, or "name 2", "name 3", ... incrementing past whatever already exists.</summary>
    public static string UniqueFolderPath(string dir, string name)
    {
        var fullPath = Path.Combine(dir, name);
        var n = 0;
        while (Exists(fullPath))
        {
            n++;
            fullPath = Path.Combine(dir, $"{name} {n}");
        }
        return fullPath;
    }

    public static bool Exists(string path) => File.Exists(path) || Directory.Exists(path);

    /// <summary>Trims <paramref name="title"/> and throws if it's empty or has a character invalid in a filename.</summary>
    public static string AssertValidTitle(string title)
    {
        var trimmed = title.Trim();
        var reason = NoteTitle.InvalidReason(trimmed);
        if (reason is not null) throw new InvalidOperationException(reason);
        return trimmed;
    }

    // Allows a case-only rename ("Foo.md" -> "foo.md") on a case-insensitive filesystem, where the destination
    // "exists" but is actually the same file as the source. .NET has no portable inode comparison, so this
    // checks that both spellings name one and the same directory entry.
    private static bool IsSameFile(string a, string b)
    {
        try
        {
            if (!string.Equals(Path.GetDirectoryName(a), Path.GetDirectoryName(b), StringComparison.Ordinal)) return false;
            if (!string.Equals(Path.GetFileName(a), Path.GetFileName(b), StringComparison.OrdinalIgnoreCase)) return false;
            var matching = Directory.EnumerateFileSystemEntries(Path.GetDirectoryName(a)!)
                .Count(e => string.Equals(Path.GetFileName(e), Path.GetFileName(a), StringComparison.OrdinalIgnoreCase));
            return matching == 1;
        }
        catch (Exception e) when (e is IOException or UnauthorizedAccessException)
        {
            return false;
        }
    }

    /// <summary>dir/newTitle.md for renaming <paramref name="currentPath"/>; throws if the title is invalid or taken by a different file.</summary>
    public static string RenamedNotePath(string currentPath, string newTitle)
    {
        var title = AssertValidTitle(newTitle);
        var newPath = Path.Combine(Path.GetDirectoryName(currentPath)!, $"{title}.md");
        if (Exists(newPath) && !IsSameFile(newPath, currentPath))
            throw new InvalidOperationException($"A note named \"{title}\" already exists in this folder");
        return newPath;
    }

    public static Note ReadNote(string root, string absPath)
    {
        var raw = Files.ReadText(absPath);
        return NoteParser.Parse(absPath, Path.GetRelativePath(root, absPath), raw, Files.MtimeMs(absPath));
    }

    /// <summary>
    /// Reads and parses every note. If <paramref name="previous"/> is given (keyed by relativePath), a file whose mtime
    /// matches its previous entry is reused instead of re-parsed. Unreadable or unparseable files are skipped.
    /// </summary>
    public static List<Note> LoadNotesFolder(string root, IReadOnlyDictionary<string, Note>? previous = null)
    {
        var notes = new List<Note>();
        foreach (var file in ListMarkdownFiles(root))
        {
            try
            {
                var relativePath = Path.GetRelativePath(root, file);
                if (previous is not null && previous.TryGetValue(relativePath, out var cached) && Files.MtimeMs(file) == cached.MtimeMs)
                {
                    notes.Add(cached);
                    continue;
                }
                notes.Add(ReadNote(root, file));
            }
            catch (Exception e) when (e is not OutOfMemoryException)
            {
                // skip unreadable/unparseable file rather than failing the whole load
            }
        }
        return notes;
    }

    private static bool NotesChanged(IReadOnlyList<Note> previous, IReadOnlyList<Note> notes)
    {
        var byPath = previous.GroupBy(n => n.RelativePath).ToDictionary(g => g.Key, g => g.Last().MtimeMs);
        if (byPath.Count != notes.Count) return true;
        foreach (var note in notes)
            if (!byPath.TryGetValue(note.RelativePath, out var m) || m != note.MtimeMs) return true;
        return false;
    }

    /// <summary>
    /// Re-walks the vault (reusing unchanged notes) and returns the reconciled notes only if something differs from
    /// <paramref name="previousNotes"/>, so a reopen of an untouched vault costs no cache write or push.
    /// </summary>
    public static List<Note>? ReconcileCache(string root, List<Note> previousNotes)
    {
        var previous = previousNotes.GroupBy(n => n.RelativePath).ToDictionary(g => g.Key, g => g.Last());
        var notes = LoadNotesFolder(root, previous);
        if (!NotesChanged(previousNotes, notes)) return null;
        NotesFolderCache.Write(root, notes);
        return notes;
    }
}
