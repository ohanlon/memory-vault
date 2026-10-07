using System.Text.Json.Nodes;
using System.Text.Json.Serialization;

namespace Cairn.Core.Models;

public sealed class WikiLink
{
    /// <summary>Raw target inside [[ ]] before the alias/header split; the full URL for an external link.</summary>
    public string Target { get; set; } = "";
    public string? Alias { get; set; }
    public string? Header { get; set; }
    /// <summary>True when the target is an external URL (http/https/mailto) rather than a note.</summary>
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public bool? External { get; set; }
}

public sealed class Note
{
    /// <summary>Absolute path on disk.</summary>
    public string Path { get; set; } = "";
    /// <summary>File name without extension, used as the link target for wikilinks.</summary>
    public string Title { get; set; } = "";
    /// <summary>Path relative to the notes folder root.</summary>
    public string RelativePath { get; set; } = "";
    public JsonObject Frontmatter { get; set; } = new();
    public List<string> Tags { get; set; } = new();
    public List<WikiLink> Links { get; set; } = new();
    public string Content { get; set; } = "";
    public double MtimeMs { get; set; }
}

public sealed class GraphNode
{
    public string Id { get; set; } = "";
    public string Path { get; set; } = "";
    public List<string> Tags { get; set; } = new();
    public bool? External { get; set; }
    public bool? IsTag { get; set; }
}

public sealed class GraphEdge
{
    public string Source { get; set; } = "";
    public string Target { get; set; } = "";
    /// <summary>"wikilink" | "tag" | "external-link"</summary>
    public string Kind { get; set; } = "";
    public string? Tag { get; set; }
}

public sealed class GraphModel
{
    public List<GraphNode> Nodes { get; set; } = new();
    public List<GraphEdge> Edges { get; set; } = new();
}

public sealed class FileChangeEvent
{
    /// <summary>"add" | "change" | "unlink"</summary>
    public string Kind { get; set; } = "";
    public string Path { get; set; } = "";
}
