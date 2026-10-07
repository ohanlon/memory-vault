namespace Cairn.Core.Shared;

/// <summary>Port of shared/noteTemplates.ts: the built-in scaffolds offered for a new note.</summary>
public static class NoteTemplates
{
    public sealed record Template(string Id, string Label, string Description, Func<string, bool, string> Build);

    private static string Frontmatter(params string[] tags) => $"---\ntags: [{string.Join(", ", tags)}]\n---\n";

    private static string Heading(string title, bool addHeading) => addHeading ? $"# {title}\n\n" : "";

    public static readonly IReadOnlyList<Template> All = new[]
    {
        new Template("blank", "Blank", "An empty note with no starting structure.",
            (title, addHeading) => Frontmatter() + (addHeading ? $"# {title}\n" : "")),
        new Template("meeting", "Meeting Notes", "Attendees, agenda, notes, and action items.",
            (title, addHeading) => Frontmatter("meeting") + Heading(title, addHeading)
                + "## Attendees\n\n\n## Agenda\n\n\n## Notes\n\n\n## Action Items\n\n"),
        new Template("journal", "Daily Journal", "A freeform log with a notes section.",
            (title, addHeading) => Frontmatter("journal") + Heading(title, addHeading) + "## Today\n\n\n## Notes\n\n"),
    };

    /// <summary>The template with this id, or the blank template when the id is missing/unknown.</summary>
    public static Template Find(string? id) => All.FirstOrDefault(t => t.Id == id) ?? All[0];
}
