using System.Text.Encodings.Web;
using System.Text.Json;
using System.Text.Json.Nodes;
using Cairn.Core.Yaml;

namespace Cairn.Core;

/// <summary>JSON conventions shared by every file Cairn reads/writes and by the renderer bridge: camelCase, no nulls for optional fields.</summary>
public static class CairnJson
{
    public static readonly JsonSerializerOptions Options = new()
    {
        TypeInfoResolver = new System.Text.Json.Serialization.Metadata.DefaultJsonTypeInfoResolver(),
        PropertyNamingPolicy = JsonNamingPolicy.CamelCase,
        DefaultIgnoreCondition = System.Text.Json.Serialization.JsonIgnoreCondition.WhenWritingNull,
        Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping,
    };

    /// <summary>For writing <see cref="JsonNode"/> trees: unlike <see cref="Options"/> it never drops explicit nulls (JSON.stringify keeps them).</summary>
    public static readonly JsonSerializerOptions NodeOptions = new()
    {
        TypeInfoResolver = new System.Text.Json.Serialization.Metadata.DefaultJsonTypeInfoResolver(),
        Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping,
    };

    private static readonly JsonSerializerOptions Indented = new(Options) { WriteIndented = true };

    public static string Serialize<T>(T value) => JsonSerializer.Serialize(value, Options);

    /// <summary>Equivalent of <c>JSON.stringify(value, null, 2)</c> (2-space indent).</summary>
    public static string SerializeIndented<T>(T value) => JsonSerializer.Serialize(value, Indented);

    /// <summary>Serializes an object, then flattens YAML date markers into ISO strings, as <c>JSON.stringify</c> does for a Date.</summary>
    public static string SerializeFlattened<T>(T value)
    {
        var node = JsonSerializer.SerializeToNode(value, Options);
        return YamlDate.Flatten(node)?.ToJsonString(NodeOptions) ?? "null";
    }

    public static T? Deserialize<T>(string json) => JsonSerializer.Deserialize<T>(json, Options);

    public static JsonNode? ToNode<T>(T value) => JsonSerializer.SerializeToNode(value, Options);

    public static string ToIndentedString(JsonNode? node)
    {
        return node is null ? "null" : node.ToJsonString(new JsonSerializerOptions(NodeOptions) { WriteIndented = true });
    }
}
