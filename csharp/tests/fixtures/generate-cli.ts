// Generates the CLI/MCP golden fixtures for the C# port by running the *original* TypeScript (electron/cli.ts and the
// built MCP server) over a fixed scenario.
//
//   npm run build:cli                                                     # builds dist-electron/mcpServer.js
//   npx vite-node -c vitest.config.ts csharp/tests/fixtures/generate-cli.ts
//
// cli-scenario.json holds each step's arguments and the TypeScript output; CliParityTests replays the steps against
// Cairn.Core and asserts the same output. mcp-tools.json is the TypeScript server's tools/list, which
// McpServerTests compares with the C# server's.
//
// Outputs are normalized so they don't depend on the machine or the clock: the temp root becomes <ROOT>, path
// separators become "/", timestamps become <TS> and mtimes become <MT>. A step can use {{ROOT}}, {{mtime}} (the last
// mtimeMs a result reported) and {{ts}} (the newest history timestamp the last result listed).
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runCliCommand } from "../../../electron/cli";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../..");

interface Step {
  args?: string[];
  stdin?: string;
  /** Writes a file (path relative to the temp root) instead of running a command. */
  write?: { path: string; content: string };
}

const run = (...args: string[]): Step => ({ args });
const NOTE = "{{ROOT}}/work";

const steps: Step[] = [
  run("list_folders"),
  run("add_folder", NOTE, "--name", "Work"),
  run("add_folder", NOTE),
  run("add_folder", "{{ROOT}}/work2", "--name", "work"),
  run("list_folders"),

  run("add_note", "--folder", "Work", "Idea", "--content", "# Idea\n\nhello world #tag1\n"),
  run("add_note", "--folder", "work", "Idea", "--content", "second"),
  run("add_note", "--folder", "Work", "Sub", "--subfolder", "Projects", "--content", "links to [[Idea]] and #tag2 #Tag1\n"),
  run("add_note", "--folder", "Work", "  ", "--content", "blank title"),
  run("get_notes", "--folder", "Work"),
  run("get_notes", "--folder", "Work", "--subfolders"),
  run("get_note", "--folder", "Work", "Idea.md"),
  run("get_note", "--folder", "Work", "nope.md"),
  run("get_note", "--folder", "Work", "/Idea.md"),
  run("get_note", "--folder", "Work", "../outside.md"),
  run("get_note", "--folder", "Nope", "Idea.md"),

  run("set_note", "--folder", "Work", "Prefs.md", "--content", "## Preferences\n- a\n\n## Other\n- b\n"),
  run("update_note", "--folder", "Work", "Prefs.md", "--content", "- c", "--heading", "preferences"),
  run("update_note", "--folder", "Work", "Prefs.md", "--content", "- d", "--heading", "Other"),
  run("update_note", "--folder", "Work", "Prefs.md", "--content", "x", "--heading", "Missing"),
  run("update_note", "--folder", "Work", "Prefs.md", "--content", "tail"),
  run("update_note", "--folder", "Work", "gone.md", "--content", "tail"),
  run("get_note", "--folder", "Work", "Prefs.md"),
  run("update_note", "--folder", "Work", "Prefs.md", "--content", "fresh", "--if-unmodified-since", "{{mtime}}"),
  run("update_note", "--folder", "Work", "Prefs.md", "--content", "stale", "--if-unmodified-since", "1"),
  run("set_note", "--folder", "Work", "Prefs.md", "--content", "stale", "--if-unmodified-since", "1"),
  run("set_note", "--folder", "Work", "deep/er/New.md", "--content", "new"),
  { args: ["set_note", "--folder", "Work", "FromStdin.md", "--content-file", "-"], stdin: "from stdin\n" },
  { write: { path: "content.txt", content: "from a file\n" } },
  run("set_note", "--folder", "Work", "FromFile.md", "--content-file", "{{ROOT}}/content.txt"),
  run("set_note", "--folder", "Work", "Bad.md", "--content-file", "{{ROOT}}/missing.txt"),

  run("get_note_history", "--folder", "Work", "Prefs.md"),

  run("set_properties", "--folder", "Work", "Idea.md", "--json", '{"status":"active","priority":2,"tags":["x","y"]}'),
  run("get_properties", "--folder", "Work", "Idea.md"),
  run("set_properties", "--folder", "Work", "Idea.md", "--json", '{"status":null,"extra":{"a":1}}'),
  run("get_note", "--folder", "Work", "Idea.md"),
  { write: { path: "work/.cairn/properties.yaml", content: "properties:\n  - name: Priority\n    type: number\n    rules:\n      max: 10\n      integerOnly: true\n  - name: code\n    type: text\n    rules:\n      maxLength: 3\n      pattern: '^[a-z]+$'\n" } },
  run("set_properties", "--folder", "Work", "Idea.md", "--json", '{"priority":99.5,"code":"ABCD"}'),
  run("set_properties", "--folder", "Work", "Idea.md", "--json", '{"priority":3,"code":"abc"}'),
  run("set_properties", "--folder", "Work", "Idea.md", "--json", "[1]"),
  run("set_properties", "--folder", "Work", "Idea.md", "--json", "{nope"),
  run("set_properties", "--folder", "Work", "gone.md", "--json", "{}"),

  run("search_notes", "--folder", "Work", "hello"),
  run("search_notes", "--folder", "Work", "HELLO", "--case-sensitive"),
  run("search_notes", "--folder", "Work", "tag", "--whole-word"),
  run("search_notes", "--folder", "Work", "t[a-z]+\\d", "--regex"),
  run("search_notes", "--folder", "Work", "zzz-no-match"),

  run("get_backlinks", "--folder", "Work", "Idea.md"),
  run("get_backlinks", "--folder", "Work", "gone.md"),
  run("get_tags", "--folder", "Work"),

  run("delete_note", "--folder", "Work", "Prefs.md", "--if-unmodified-since", "1"),
  run("delete_note", "--folder", "Work", "Prefs.md"),
  run("delete_note", "--folder", "Work", "Prefs.md"),
  run("get_note_history", "--folder", "Work", "Prefs.md"),
  run("restore_note_version", "--folder", "Work", "Prefs.md", "--timestamp", "{{ts}}"),
  run("get_note", "--folder", "Work", "Prefs.md"),
  run("restore_note_version", "--folder", "Work", "Prefs.md", "--timestamp", "2000-01-01T00:00:00.000Z"),
  run("restore_note_version", "--folder", "Work", "Prefs.md", "--timestamp", "not a date"),

  { write: { path: "work/attachments/used.png", content: "png" } },
  { write: { path: "work/attachments/unused.png", content: "png" } },
  run("add_note", "--folder", "Work", "Pic", "--content", "![](attachments/used.png)\n"),
  run("get_orphaned_attachments", "--folder", "Work"),
  run("delete_orphaned_attachments", "--folder", "Work"),
  run("get_orphaned_attachments", "--folder", "Work"),

  { write: { path: "work/.templates/Meeting.md", content: "# {{title}}\n\nWith {{who}}\n" } },
  run("add_note", "--folder", "Work", "Standup", "--template", "meeting", "--values", '{"who":"Pete"}'),
  run("add_note", "--folder", "Work", "Standup", "--template", "Meeting"),
  run("add_note", "--folder", "Work", "X", "--template", "Nope"),
  run("add_note", "--folder", "Work", "X", "--template", "Meeting", "--content", "c"),
  run("add_note", "--folder", "Work", "X", "--values", "{}"),
  run("add_note", "--folder", "Work", "X", "--template", "Meeting", "--values", "[1]"),

  { write: { path: "userdata/cli-access.json", content: '{"allowed":[]}' } },
  run("get_notes", "--folder", "Work"),
  run("list_folders"),

  run("get_note", "--folder", "Work"),
  run("get_note"),
  run("set_note", "--folder", "Work", "A.md"),
  run("set_note", "--folder", "Work", "A.md", "--content", "x", "--content-file", "y"),
  run("add_folder"),
  run("frobnicate"),
];

function substitute(text: string, vars: Record<string, string>): string {
  return text.replace(/\{\{(ROOT|mtime|ts)\}\}/g, (_, k: string) => vars[k] ?? "");
}

function normalize(value: unknown, root: string): unknown {
  const text = (s: string) =>
    s
      .split(root)
      .join("<ROOT>")
      .replace(/\\/g, "/")
      .replace(/\d{4}-\d\d-\d\dT[\d:.]+Z/g, "<TS>")
      .replace(/\d{12,}(\.\d+)?/g, "<MT>");
  if (typeof value === "string") return text(value);
  if (Array.isArray(value)) return value.map((v) => normalize(v, root));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [
        k,
        (k === "mtimeMs" || k === "currentMtimeMs") && typeof v === "number" ? "<MT>" : normalize(v, root),
      ])
    );
  }
  return value;
}

async function generateScenario(): Promise<void> {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "cairn-cli-golden-"));
  const userData = path.join(root, "userdata");
  fs.mkdirSync(userData, { recursive: true });
  const foldersFile = path.join(userData, "notesFolders.json");
  const accessFile = path.join(userData, "cli-access.json");
  const historyDir = path.join(userData, "history");

  const vars: Record<string, string> = { ROOT: root };
  const out: unknown[] = [];

  for (const step of steps) {
    if (step.write) {
      const target = path.join(root, ...step.write.path.split("/"));
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, step.write.content, "utf-8");
      out.push({ write: step.write });
      continue;
    }
    const args = step.args!.map((a) => substitute(a, vars));
    let expected: unknown;
    try {
      const result = await runCliCommand(args, foldersFile, accessFile, historyDir, () => step.stdin ?? "");
      if (typeof result.mtimeMs === "number") vars.mtime = String(result.mtimeMs);
      const versions = result.versions as { timestamp: string }[] | undefined;
      if (versions?.length) vars.ts = versions[0].timestamp;
      expected = { result: normalize(result, root) };
    } catch (err) {
      expected = { error: normalize(err instanceof Error ? err.message : String(err), root) };
    }
    out.push({ args: step.args, stdin: step.stdin, expected });
  }

  fs.rmSync(root, { recursive: true, force: true });
  fs.writeFileSync(path.join(here, "cli-scenario.json"), JSON.stringify(out, null, 2), "utf-8");
  console.log(`wrote cli-scenario.json (${out.length} steps)`);
}

// Asks the built TypeScript MCP server for its tool list.
function generateMcpTools(): Promise<void> {
  const server = path.join(repoRoot, "dist-electron", "mcpServer.js");
  if (!fs.existsSync(server)) throw new Error("dist-electron/mcpServer.js not found - run `npm run build:cli` first.");

  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [server], { stdio: ["pipe", "pipe", "inherit"] });
    let buffer = "";
    child.stdout.on("data", (chunk) => {
      buffer += chunk;
      for (let nl = buffer.indexOf("\n"); nl >= 0; nl = buffer.indexOf("\n")) {
        const message = JSON.parse(buffer.slice(0, nl));
        buffer = buffer.slice(nl + 1);
        if (message.id === 2) {
          child.kill();
          fs.writeFileSync(path.join(here, "mcp-tools.json"), JSON.stringify(message.result.tools, null, 2), "utf-8");
          console.log(`wrote mcp-tools.json (${message.result.tools.length} tools)`);
          resolve();
        }
      }
    });
    child.on("error", reject);
    const send = (m: object) => child.stdin.write(JSON.stringify({ jsonrpc: "2.0", ...m }) + "\n");
    send({ id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "generate-cli", version: "0" } } });
    send({ method: "notifications/initialized" });
    send({ id: 2, method: "tools/list" });
  });
}

await generateScenario();
await generateMcpTools();
