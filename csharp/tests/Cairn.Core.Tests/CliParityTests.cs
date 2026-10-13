using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;
using Cairn.Core.Cli;
using Cairn.Core.Storage;
using Cairn.Core.Yaml;

namespace Cairn.Core.Tests;

/// <summary>
/// Replays cli-scenario.json (recorded by running the original electron/cli.ts, see tests/fixtures/generate-cli.ts)
/// against <see cref="CliCommands"/> and asserts every result, error message and key order is the same.
/// </summary>
public sealed class CliParityTests : IDisposable
{
    private readonly string _root = Path.Combine(Path.GetTempPath(), "cairn-cli-parity-" + Guid.NewGuid().ToString("N"));

    public CliParityTests() => Directory.CreateDirectory(Path.Combine(_root, "userdata"));

    public void Dispose()
    {
        try { Directory.Delete(_root, recursive: true); } catch (IOException) { }
    }

    // The same normalization as generate-cli.ts: temp root, separators, timestamps and mtimes.
    private JsonNode? Normalize(JsonNode? node, string? key = null)
    {
        switch (node)
        {
            case JsonObject o:
                var result = new JsonObject();
                foreach (var (k, v) in o) result[k] = Normalize(v, k);
                return result;
            case JsonArray a:
                return new JsonArray(a.Select(v => Normalize(v)).ToArray());
            case JsonValue v when v.TryGetValue<string>(out var s):
                return Text(s);
            case JsonValue v when key is "mtimeMs" or "currentMtimeMs" && v.TryGetValue<double>(out _):
                return "<MT>";
            default:
                return node?.DeepClone();
        }
    }

    private string Text(string s)
    {
        var text = s.Replace(_root, "<ROOT>").Replace('\\', '/');
        text = Regex.Replace(text, "[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9:.]+Z", "<TS>");
        return Regex.Replace(text, @"[0-9]{12,}(\.[0-9]+)?", "<MT>");
    }

    [Fact]
    public void Matches_the_TypeScript_cli_step_for_step()
    {
        var steps = JsonNode.Parse(File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "cli-scenario.json")))!.AsArray();
        var ops = new CliOperations(new CairnPaths(Path.Combine(_root, "userdata")));
        var vars = new Dictionary<string, string> { ["ROOT"] = _root };
        var mismatches = new List<string>();

        string Substitute(string text) => Regex.Replace(text, @"\{\{(ROOT|mtime|ts)\}\}", m => vars.GetValueOrDefault(m.Groups[1].Value, ""));

        for (var i = 0; i < steps.Count; i++)
        {
            var step = steps[i]!.AsObject();
            if (step["write"] is JsonObject write)
            {
                var target = Path.Combine(new[] { _root }.Concat(((string)write["path"]!).Split('/')).ToArray());
                Directory.CreateDirectory(Path.GetDirectoryName(target)!);
                File.WriteAllText(target, (string)write["content"]!);
                continue;
            }

            var args = step["args"]!.AsArray().Select(a => Substitute((string)a!)).ToArray();
            var stdin = step["stdin"]?.GetValue<string>();
            var expected = step["expected"]!.AsObject();

            JsonObject actual;
            try
            {
                var result = CliCommands.Run(args, ops, () => stdin ?? "");
                if (result["mtimeMs"] is JsonValue m && m.TryGetValue<double>(out var mtime)) vars["mtime"] = JsNumber.ToString(mtime);
                if (result["versions"] is JsonArray { Count: > 0 } versions) vars["ts"] = (string)versions[0]!["timestamp"]!;
                actual = new JsonObject { ["result"] = Normalize(result) };
            }
            catch (InvalidOperationException e)
            {
                actual = new JsonObject { ["error"] = Text(e.Message) };
            }

            // Compared as text, so a difference in key order counts too.
            var want = Files.Compact(expected);
            var got = Files.Compact(actual);
            if (want != got) mismatches.Add($"step {i} ({string.Join(' ', args)})\n  expected: {want}\n  actual:   {got}");
        }

        Assert.True(mismatches.Count == 0, string.Join("\n", mismatches));
    }
}
