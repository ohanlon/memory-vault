using System.Text.Json;
using System.Text.Json.Nodes;
using Cairn.Core.Storage;

namespace Cairn.Core.Cli;

/// <summary>
/// Port of electron/mcpServer.ts: the CLI's operations as MCP tools over stdio (newline-delimited JSON-RPC). Only the
/// tools capability is implemented, which is all the TypeScript server declares. Tool names, descriptions and input
/// schemas match it (a test compares them with the TypeScript server's own tools/list).
/// </summary>
public sealed class McpServer(CliOperations ops)
{
    private static readonly string[] SupportedVersions = { "2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05", "2024-10-07" };

    private sealed record Tool(string Name, string Description, JsonObject InputSchema, Func<ToolArgs, JsonObject> Call);

    /// <summary>A tool call's arguments, already checked against the tool's schema.</summary>
    private sealed class ToolArgs(JsonObject values)
    {
        public string Str(string key) => (string)values[key]!;
        public string? OptStr(string key) => values[key] is JsonValue v && v.TryGetValue<string>(out var s) ? s : null;
        public bool? OptBool(string key) => values[key] is JsonValue v && v.TryGetValue<bool>(out var b) ? b : null;
        public double? OptNum(string key) => values[key] is JsonValue v && v.TryGetValue<double>(out var d) ? d : null;
        public JsonObject? OptObj(string key) => values[key] as JsonObject;
        public JsonObject Obj(string key) => (JsonObject)values[key]!;
    }

    // ---- schema helpers (JSON Schema draft-07, shaped like the TypeScript SDK's zod output) -------------------

    private static JsonObject Typed(string type, string? description = null)
    {
        var o = new JsonObject();
        if (description is not null) o["description"] = description;
        o["type"] = type;
        return o;
    }

    private static JsonObject Str(string? description = null) => Typed("string", description);

    private static JsonObject StringMap(string description, JsonObject valueSchema)
    {
        var o = Typed("object", description);
        o["propertyNames"] = new JsonObject { ["type"] = "string" };
        o["additionalProperties"] = valueSchema;
        return o;
    }

    private static JsonObject Schema(string[] required, params (string Key, JsonObject Prop)[] properties)
    {
        var props = new JsonObject();
        foreach (var (key, prop) in properties) props[key] = prop;
        var schema = new JsonObject { ["$schema"] = "http://json-schema.org/draft-07/schema#", ["type"] = "object", ["properties"] = props };
        if (required.Length > 0) schema["required"] = new JsonArray(required.Select(r => (JsonNode)r).ToArray());
        return schema;
    }

    private const string NotePathDescription = "Path relative to the notes folder root";

    private static readonly string IfUnmodified =
        "An mtimeMs from an earlier get_note/get_properties call on this note. If the note changed since, the write is rejected instead of overwriting it.";

    private IReadOnlyList<Tool> BuildTools() => new Tool[]
    {
        new("add_folder", "Register a folder as a Cairn notes folder, creating the directory if it doesn't exist.",
            Schema(new[] { "path" }, ("path", Str("Filesystem path to the notes folder")),
                ("name", Str("Name to register it under; defaults to the folder's basename"))),
            a => ops.AddFolder(a.Str("path"), a.OptStr("name"))),

        new("list_folders", "List every Cairn notes folder that CLI/MCP access has been granted for.",
            Schema(Array.Empty<string>()),
            _ => ops.ListFolders()),

        new("get_notes", "List the markdown notes in a notes folder.",
            Schema(new[] { "folder" }, ("folder", Str("Registered notes folder name")),
                ("subfolders", Typed("boolean", "Include notes in subfolders (default: top-level only)"))),
            a => ops.GetNotes(a.Str("folder"), a.OptBool("subfolders") ?? false)),

        new("get_note",
            "Read the contents of a note. The result's mtimeMs can be passed back as ifUnmodifiedSince to update_note/set_note/set_properties/delete_note to avoid clobbering a change made since this read.",
            Schema(new[] { "folder", "notePath" }, ("folder", Str()), ("notePath", Str(NotePathDescription))),
            a => ops.GetNote(a.Str("folder"), a.Str("notePath"))),

        new("add_note",
            "Create a new note with a title. Auto-renames on a title collision instead of overwriting - use set_note if you want to create-or-overwrite a note at an exact path. Pass either content or template, not both.",
            Schema(new[] { "folder", "title" }, ("folder", Str()), ("title", Str()), ("content", Str()),
                ("subfolder", Str("Subfolder to create the note in, created if missing")),
                ("template", Str("Name of a custom file template in this notes folder's .templates folder (see get_notes) to render instead of content - {{placeholders}} filled from values, plus {{date}}/{{time}}/{{datetime}}.")),
                ("values", StringMap("Placeholder values for template's {{name}} tags", Str()))),
            a => ops.AddNote(a.Str("folder"), a.Str("title"), a.OptStr("content") ?? "", a.OptStr("subfolder"), a.OptStr("template"), a.OptObj("values"))),

        new("set_note",
            "Create or overwrite a note at an exact path. Use this to maintain a specific memory file you expect to keep writing back to.",
            Schema(new[] { "folder", "notePath", "content" }, ("folder", Str()), ("notePath", Str(NotePathDescription)), ("content", Str()),
                ("ifUnmodifiedSince", Typed("number", IfUnmodified + " Ignored when the note doesn't exist yet."))),
            a => ops.SetNote(a.Str("folder"), a.Str("notePath"), a.Str("content"), a.OptNum("ifUnmodifiedSince"))),

        new("update_note",
            "Append text to an existing note - either at the end of the file, or at the end of a specific heading's section.",
            Schema(new[] { "folder", "notePath", "content" }, ("folder", Str()), ("notePath", Str()), ("content", Str()),
                ("heading", Str("Insert at the end of this heading's section instead of end-of-file")),
                ("ifUnmodifiedSince", Typed("number", IfUnmodified))),
            a => ops.UpdateNote(a.Str("folder"), a.Str("notePath"), a.Str("content"), a.OptStr("heading"), a.OptNum("ifUnmodifiedSince"))),

        new("delete_note", "Delete a note.",
            Schema(new[] { "folder", "notePath" }, ("folder", Str()), ("notePath", Str(NotePathDescription)),
                ("ifUnmodifiedSince", Typed("number", "An mtimeMs from an earlier get_note/get_properties call. If the note changed since, the delete is rejected."))),
            a => ops.DeleteNote(a.Str("folder"), a.Str("notePath"), a.OptNum("ifUnmodifiedSince"))),

        new("search_notes", "Search note contents for a query, returning matching lines grouped by note.",
            Schema(new[] { "folder", "query" }, ("folder", Str()), ("query", Str()),
                ("regex", Typed("boolean", "Treat query as a regular expression instead of a plain substring")),
                ("caseSensitive", Typed("boolean")),
                ("wholeWord", Typed("boolean", "Only applies in plain (non-regex) mode"))),
            a => ops.SearchNotes(a.Str("folder"), a.Str("query"),
                new SearchNotesOptions(a.OptBool("regex") ?? false, a.OptBool("caseSensitive") ?? false, a.OptBool("wholeWord") ?? false))),

        new("get_backlinks",
            "List notes that wikilink/markdown-link to a note (excludes notes that only share a tag - use get_tags for that).",
            Schema(new[] { "folder", "notePath" }, ("folder", Str()), ("notePath", Str(NotePathDescription))),
            a => ops.GetBacklinks(a.Str("folder"), a.Str("notePath"))),

        new("get_tags", "List every tag in a notes folder, each with the notes that carry it.",
            Schema(new[] { "folder" }, ("folder", Str())),
            a => ops.GetTags(a.Str("folder"))),

        new("get_properties",
            "Read a note's frontmatter properties. The result's mtimeMs can be passed back as ifUnmodifiedSince to update_note/set_note/set_properties/delete_note to avoid clobbering a change made since this read.",
            Schema(new[] { "folder", "notePath" }, ("folder", Str()), ("notePath", Str(NotePathDescription))),
            a => ops.GetProperties(a.Str("folder"), a.Str("notePath"))),

        new("set_properties",
            "Merge values into a note's frontmatter properties (JSON Merge Patch semantics). Existing properties not mentioned are left untouched; a property set to null is removed.",
            Schema(new[] { "folder", "notePath", "properties" }, ("folder", Str()), ("notePath", Str(NotePathDescription)),
                ("properties", StringMap("Properties to set; a value of null removes that key", new JsonObject())),
                ("ifUnmodifiedSince", Typed("number", IfUnmodified))),
            a => ops.SetProperties(a.Str("folder"), a.Str("notePath"), a.Obj("properties"), a.OptNum("ifUnmodifiedSince"))),

        new("get_note_history",
            "List local version snapshots recorded for a note, newest first. Each entry's timestamp can be passed to restore_note_version.",
            Schema(new[] { "folder", "notePath" }, ("folder", Str()), ("notePath", Str(NotePathDescription))),
            a => ops.GetNoteHistory(a.Str("folder"), a.Str("notePath"))),

        new("restore_note_version",
            "Overwrite a note with one of its recorded history snapshots (see get_note_history). The note's current content is itself snapshotted first, so this can be undone.",
            Schema(new[] { "folder", "notePath", "timestamp" }, ("folder", Str()), ("notePath", Str(NotePathDescription)),
                ("timestamp", Str("A timestamp from get_note_history")),
                ("ifUnmodifiedSince", Typed("number", "An mtimeMs from an earlier get_note/get_properties call. If the note changed since, the restore is rejected."))),
            a => ops.RestoreNoteVersion(a.Str("folder"), a.Str("notePath"), a.Str("timestamp"), a.OptNum("ifUnmodifiedSince"))),

        new("get_orphaned_attachments",
            "List attachments (files under the notes folder's attachments/ folder) that no note currently embeds via ![](path) - candidates for delete_orphaned_attachments.",
            Schema(new[] { "folder" }, ("folder", Str())),
            a => ops.GetOrphanedAttachments(a.Str("folder"))),

        new("delete_orphaned_attachments",
            "Delete every attachment no note currently embeds (recomputed fresh, see get_orphaned_attachments).",
            Schema(new[] { "folder" }, ("folder", Str())),
            a => ops.DeleteOrphanedAttachments(a.Str("folder"))),
    };

    // ---- argument validation ----------------------------------------------------------------------------------

    private static string Describe(JsonNode? n) => n switch
    {
        null => "undefined",
        JsonArray => "array",
        JsonObject => "object",
        JsonValue v when v.TryGetValue<string>(out _) => "string",
        JsonValue v when v.TryGetValue<bool>(out _) => "boolean",
        _ => "number",
    };

    private static bool Matches(JsonNode? value, JsonObject schema)
    {
        if (!schema.TryGetPropertyValue("type", out var type) || type is null) return true; // {} accepts anything
        return type.ToString() switch
        {
            "string" => Describe(value) == "string",
            "boolean" => Describe(value) == "boolean",
            "number" => Describe(value) == "number",
            "object" => value is JsonObject o && (schema["additionalProperties"] is not JsonObject ap || o.All(kv => Matches(kv.Value, ap))),
            _ => true,
        };
    }

    private static string? Validate(Tool tool, JsonObject args)
    {
        var props = (JsonObject)tool.InputSchema["properties"]!;
        var required = (tool.InputSchema["required"] as JsonArray)?.Select(r => r!.ToString()).ToHashSet() ?? new HashSet<string>();
        foreach (var (key, schema) in props)
        {
            var value = args[key];
            if (value is null && !required.Contains(key)) continue;
            // A present-but-null optional value is rejected, like zod's .optional() (which only allows undefined).
            if (Matches(value, (JsonObject)schema!)) continue;
            var expected = ((JsonObject)schema!)["type"]!.ToString();
            return $"Input validation error: Invalid arguments for tool {tool.Name}: Invalid input: expected {expected}, received {Describe(value)} at {key}";
        }
        return null;
    }

    // ---- JSON-RPC ---------------------------------------------------------------------------------------------

    private static JsonObject ErrorResponse(JsonNode? id, int code, string message) => new()
    {
        ["jsonrpc"] = "2.0",
        ["id"] = id?.DeepClone(),
        ["error"] = new JsonObject { ["code"] = code, ["message"] = message },
    };

    private static JsonObject Result(JsonNode? id, JsonNode result) => new() { ["jsonrpc"] = "2.0", ["id"] = id?.DeepClone(), ["result"] = result };

    private static JsonObject TextResult(string text, bool isError = false)
    {
        var result = new JsonObject { ["content"] = new JsonArray(new JsonObject { ["type"] = "text", ["text"] = text }) };
        if (isError) result["isError"] = true;
        return result;
    }

    private IReadOnlyList<Tool>? _toolList;

    private JsonObject CallTool(JsonObject? parameters)
    {
        _toolList ??= BuildTools();
        var name = parameters?["name"]?.ToString() ?? "";
        var tool = _toolList.FirstOrDefault(t => t.Name == name);
        if (tool is null) return TextResult($"MCP error -32602: Tool {name} not found", isError: true);

        var args = parameters?["arguments"] as JsonObject ?? new JsonObject();
        if (Validate(tool, args) is { } problem) return TextResult($"MCP error -32602: {problem}", isError: true);

        try { return TextResult(Files.Indented(tool.Call(new ToolArgs(args)))); }
        catch (Exception e) when (e is not OutOfMemoryException) { return TextResult(e.Message, isError: true); }
    }

    /// <summary>Handles one JSON-RPC message; null for a notification (nothing is sent back).</summary>
    public JsonObject? Handle(JsonNode? message)
    {
        if (message is not JsonObject request || request["method"] is not JsonValue methodValue)
            return message is JsonObject o && o["id"] is not null ? ErrorResponse(o["id"], -32600, "Invalid Request") : null;
        var method = methodValue.ToString();
        var id = request["id"];
        if (id is null) return null; // notifications/initialized, notifications/cancelled, ...

        var parameters = request["params"] as JsonObject;
        switch (method)
        {
            case "initialize":
            {
                var requested = parameters?["protocolVersion"]?.ToString();
                return Result(id, new JsonObject
                {
                    ["protocolVersion"] = requested is not null && SupportedVersions.Contains(requested) ? requested : SupportedVersions[0],
                    ["capabilities"] = new JsonObject { ["tools"] = new JsonObject { ["listChanged"] = true } },
                    ["serverInfo"] = new JsonObject { ["name"] = "cairn", ["version"] = "0.1.0" },
                });
            }
            case "ping":
                return Result(id, new JsonObject());
            case "tools/list":
            {
                _toolList ??= BuildTools();
                var list = new JsonArray();
                foreach (var t in _toolList)
                    list.Add(new JsonObject
                    {
                        ["name"] = t.Name,
                        ["description"] = t.Description,
                        ["inputSchema"] = t.InputSchema.DeepClone(),
                        ["execution"] = new JsonObject { ["taskSupport"] = "forbidden" },
                    });
                return Result(id, new JsonObject { ["tools"] = list });
            }
            case "tools/call":
                return Result(id, CallTool(parameters));
            default:
                return ErrorResponse(id, -32601, "Method not found");
        }
    }

    /// <summary>Serves requests until the input ends.</summary>
    public async Task RunAsync(TextReader input, TextWriter output)
    {
        while (await input.ReadLineAsync() is { } line)
        {
            if (line.Trim().Length == 0) continue;
            JsonObject? response;
            try { response = Handle(JsonNode.Parse(line)); }
            catch (JsonException) { response = ErrorResponse(null, -32700, "Parse error"); }
            if (response is null) continue;
            await output.WriteAsync(Files.Compact(response) + "\n");
            await output.FlushAsync();
        }
    }
}
