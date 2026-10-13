using System.Text;
using Cairn.Core.Cli;
using Cairn.Core.Storage;

// Port of electron/cliMain.ts and electron/mcpServer.ts in one executable: `cairn-cli <command> ...` runs a command and
// prints its JSON result; `cairn-cli mcp` serves the same operations as MCP tools over stdio. Both read and write the
// same registry and CLI-access files as the GUI (and as the Electron build), so a folder must have been granted
// "Allow CLI/MCP access" in the app before either can touch it.

var utf8 = new UTF8Encoding(encoderShouldEmitUTF8Identifier: false);
var stdout = new StreamWriter(Console.OpenStandardOutput(), utf8) { AutoFlush = true, NewLine = "\n" };
var stdin = new StreamReader(Console.OpenStandardInput(), utf8);

var ops = new CliOperations(new CairnPaths(UserDataDir.Resolve()));

if (args.Length > 0 && args[0] == "mcp")
{
    await new McpServer(ops).RunAsync(stdin, stdout);
    return 0;
}

var cliArgs = CliCommands.ExtractArgs(args);
if (cliArgs is null)
{
    Console.Error.WriteLine($"Usage: cairn-cli <command> [options]\nCommands: {string.Join(", ", CliCommands.Names)}\n       cairn-cli mcp   (serve the same operations as an MCP server over stdio)");
    return 1;
}

try
{
    var result = CliCommands.Run(cliArgs, ops, stdin.ReadToEnd);
    stdout.Write(Files.Indented(result) + "\n");
    return result["ok"] is System.Text.Json.Nodes.JsonValue v && v.TryGetValue<bool>(out var ok) && !ok ? 1 : 0;
}
catch (Exception e) when (e is not OutOfMemoryException)
{
    Console.Error.WriteLine(e.Message);
    return 1;
}
