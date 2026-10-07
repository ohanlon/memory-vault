using Cairn.Core.Models;

namespace Cairn.Core.Markdown;

/// <summary>Port of shared/parseNote.ts: raw markdown + frontmatter into a <see cref="Note"/>.</summary>
public static class NoteParser
{
    public static Note Parse(string path, string relativePath, string raw, double mtimeMs)
    {
        var matter = Matter.Parse(raw);
        var tags = new List<string>();
        var seen = new HashSet<string>(StringComparer.Ordinal);
        foreach (var tag in NoteLinks.ExtractTags(matter.Data).Concat(NoteLinks.ExtractInlineTags(matter.Content)))
            if (seen.Add(tag)) tags.Add(tag);

        return new Note
        {
            Path = path,
            RelativePath = relativePath,
            Title = NoteLinks.TitleFromPath(relativePath),
            Frontmatter = matter.Data,
            Tags = tags,
            Links = NoteLinks.ExtractWikiLinks(matter.Content).Concat(NoteLinks.ExtractMarkdownLinks(matter.Content)).ToList(),
            Content = matter.Content,
            MtimeMs = mtimeMs,
        };
    }
}
