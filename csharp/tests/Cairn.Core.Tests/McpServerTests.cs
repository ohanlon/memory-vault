using System.Text.Json.Nodes;
using Cairn.Core.Cli;
using Cairn.Core.Storage;

namespace Cairn.Core.Tests;

public sealed class McpServerTests : IDisposable
{
    private readonly string _root = Path.Combine(Path.GetTempPath(), "cairn-mcp-" + Guid.NewGuid().ToString("N"));
    private readonly CliOperations _ops;
    private readonly McpServer _server;

    public McpServerTests()
    {
        Directory.CreateDirectory(_root);
        _ops = new CliOperations(new CairnPaths(Path.Combine(_root, "userdata")));
        _server = new McpServer(_ops);
    }

    public void Dispose()
    {
        try { Directory.Delete(_root, recursive: true); } catch (IOException) { }
    }

    private JsonObject Request(string method, JsonObject? parameters = null, int id = 1) =>
        _server.Handle(new JsonObject { ["jsonrpc"] = "2.0", ["id"] = id, ["method"] = method, ["params"] = parameters })!;

    private JsonObject Call(string tool, JsonObject args) =>
        (JsonObject)Request("tools/call", new JsonObject { ["name"] = tool, ["arguments"] = args })["result"]!;

    private static string TextOf(JsonObject toolResult) => (string)toolResult["content"]![0]!["text"]!;

    [Fact]
    public void Tool_list_matches_the_TypeScript_server()
    {
        var expected = JsonNode.Parse(File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "mcp-tools.json")))!;
        var actual = Request("tools/list")["result"]!["tools"]!;
        Assert.Null(JsonCompare.Diff(expected, actual));
        // The order is part of what a client shows.
        Assert.Equal(
            expected.AsArray().Select(t => (string)t!["name"]!),
            actual.AsArray().Select(t => (string)t!["name"]!));
    }

    [Fact]
    public void Initialize_negotiates_the_protocol_version()
    {
        var known = Request("initialize", new JsonObject { ["protocolVersion"] = "2025-06-18" })["result"]!;
        Assert.Equal("2025-06-18", (string)known["protocolVersion"]!);
        Assert.Equal("cairn", (string)known["serverInfo"]!["name"]!);
        Assert.True((bool)known["capabilities"]!["tools"]!["listChanged"]!);

        var unknown = Request("initialize", new JsonObject { ["protocolVersion"] = "1999-01-01" })["result"]!;
        Assert.Equal("2025-11-25", (string)unknown["protocolVersion"]!);
    }

    [Fact]
    public void Ping_unknown_methods_and_notifications()
    {
        Assert.Empty(Request("ping")["result"]!.AsObject());
        Assert.Equal(-32601, (int)Request("resources/list")["error"]!["code"]!);
        Assert.Null(_server.Handle(new JsonObject { ["jsonrpc"] = "2.0", ["method"] = "notifications/initialized" }));
    }

    [Fact]
    public void A_tool_call_returns_the_operation_result_as_indented_json()
    {
        var folder = Path.Combine(_root, "notes");
        var added = Call("add_folder", new JsonObject { ["path"] = folder, ["name"] = "Notes" });
        Assert.Null(added["isError"]);
        Assert.Equal("Created notes folder \"Notes\".", (string)JsonNode.Parse(TextOf(added))!["message"]!);
        Assert.Contains("\n  \"ok\": true", TextOf(added));

        Call("set_note", new JsonObject { ["folder"] = "Notes", ["notePath"] = "A.md", ["content"] = "héllo" });
        var read = JsonNode.Parse(TextOf(Call("get_note", new JsonObject { ["folder"] = "Notes", ["notePath"] = "A.md" })))!;
        Assert.Equal("héllo", (string)read["content"]!);
    }

    [Fact]
    public void Failures_come_back_as_error_results_not_protocol_errors()
    {
        var unknownTool = Call("nope", new JsonObject());
        Assert.True((bool)unknownTool["isError"]!);
        Assert.Equal("MCP error -32602: Tool nope not found", TextOf(unknownTool));

        var missing = Call("get_tags", new JsonObject());
        Assert.True((bool)missing["isError"]!);
        Assert.Equal("MCP error -32602: Input validation error: Invalid arguments for tool get_tags: Invalid input: expected string, received undefined at folder", TextOf(missing));

        var wrongType = Call("get_notes", new JsonObject { ["folder"] = "x", ["subfolders"] = "yes" });
        Assert.Contains("expected boolean, received string at subfolders", TextOf(wrongType));

        var wrongValueType = Call("add_note", new JsonObject { ["folder"] = "x", ["title"] = "t", ["values"] = new JsonObject { ["a"] = 1 } });
        Assert.True((bool)wrongValueType["isError"]!);

        var noFolder = Call("get_tags", new JsonObject { ["folder"] = "Nope" });
        Assert.True((bool)noFolder["isError"]!);
        Assert.StartsWith("No notes folder named \"Nope\"", TextOf(noFolder));
    }

    [Fact]
    public void A_folder_must_be_granted_access_before_a_tool_can_reach_it()
    {
        Call("add_folder", new JsonObject { ["path"] = Path.Combine(_root, "notes"), ["name"] = "Notes" });
        CliAccess.Write(Path.Combine(_root, "userdata", "cli-access.json"), Array.Empty<string>());

        var denied = Call("get_notes", new JsonObject { ["folder"] = "Notes" });
        Assert.True((bool)denied["isError"]!);
        Assert.Contains("has not been granted", TextOf(denied));
        Assert.Empty(JsonNode.Parse(TextOf(Call("list_folders", new JsonObject())))!["folders"]!.AsArray());
    }

    [Fact]
    public async Task Serves_newline_delimited_json_rpc_over_streams()
    {
        var input = new StringReader(string.Join("\n",
            """{"jsonrpc":"2.0","id":1,"method":"ping"}""",
            """{"jsonrpc":"2.0","method":"notifications/initialized"}""",
            "not json",
            "",
            """{"jsonrpc":"2.0","id":2,"method":"bogus"}""") + "\n");
        var output = new StringWriter { NewLine = "\n" };

        await _server.RunAsync(input, output);

        var lines = output.ToString().Split('\n', StringSplitOptions.RemoveEmptyEntries);
        Assert.Equal(3, lines.Length);
        Assert.Equal("""{"jsonrpc":"2.0","id":1,"result":{}}""", lines[0]);
        Assert.Equal(-32700, (int)JsonNode.Parse(lines[1])!["error"]!["code"]!);
        Assert.Equal(-32601, (int)JsonNode.Parse(lines[2])!["error"]!["code"]!);
    }
}
