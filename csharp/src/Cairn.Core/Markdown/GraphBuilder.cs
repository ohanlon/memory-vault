using Cairn.Core.Models;

namespace Cairn.Core.Markdown;

/// <summary>Port of shared/buildGraph.ts: notes become nodes; wikilinks, external links and tags become edges.</summary>
public static class GraphBuilder
{
    public static GraphModel Build(IReadOnlyList<Note> notes)
    {
        var byLowerTitle = new Dictionary<string, Note>(StringComparer.Ordinal);
        foreach (var note in notes) byLowerTitle[note.Title.ToLowerInvariant()] = note;

        var nodes = notes.Select(n => new GraphNode { Id = n.Title, Path = n.Path, Tags = n.Tags }).ToList();
        var externalNodeIds = new HashSet<string>(StringComparer.Ordinal);
        var edges = new List<GraphEdge>();
        var seenWikiEdges = new HashSet<string>(StringComparer.Ordinal);

        foreach (var note in notes)
        {
            var sourceId = note.Title;
            foreach (var link in note.Links)
            {
                if (link.External == true)
                {
                    var id = link.Target;
                    if (externalNodeIds.Add(id))
                        nodes.Add(new GraphNode { Id = id, Path = id, Tags = new List<string>(), External = true });
                    if (!seenWikiEdges.Add($"{sourceId}->{id}")) continue;
                    edges.Add(new GraphEdge { Source = sourceId, Target = id, Kind = "external-link" });
                    continue;
                }

                if (!byLowerTitle.TryGetValue(link.Target.ToLowerInvariant(), out var target) || ReferenceEquals(target, note))
                    continue;
                var targetId = target.Title;
                if (!seenWikiEdges.Add($"{sourceId}->{targetId}")) continue;
                edges.Add(new GraphEdge { Source = sourceId, Target = targetId, Kind = "wikilink" });
            }
        }

        var tagNodeIds = new HashSet<string>(StringComparer.Ordinal);
        foreach (var note in notes)
        {
            foreach (var tag in note.Tags)
            {
                var tagNodeId = $"#{tag}";
                if (tagNodeIds.Add(tagNodeId))
                    nodes.Add(new GraphNode { Id = tagNodeId, Path = tagNodeId, Tags = new List<string>(), IsTag = true });
                edges.Add(new GraphEdge { Source = note.Title, Target = tagNodeId, Kind = "tag", Tag = tag });
            }
        }

        return new GraphModel { Nodes = nodes, Edges = edges };
    }

    /// <summary>Titles of notes that link to <paramref name="id"/>, deduplicated, excluding self-links.</summary>
    public static List<string> BacklinkTitles(GraphModel graph, string id) =>
        graph.Edges.Where(e => e.Target == id && e.Source != id).Select(e => e.Source).Distinct().ToList();
}
