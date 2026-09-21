import path from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import {
  addFolder,
  addNote,
  deleteNote,
  getNote,
  getNotes,
  listFolders,
  searchNotes,
  setNote,
  updateNote,
} from "./cli";
import { cairnUserDataDir } from "./userDataDir";

// Exposes the same operations as the `cairn.exe`/`electron .` CLI
// (electron/cli.ts) as MCP tools, for agents (Claude Desktop, Claude Code)
// to read and write a Cairn notes folder directly instead of shelling out.
// Runs as a standalone Node process - no Electron runtime involved - so it
// reads/writes the same notesFolders.json the packaged app uses by
// replicating Electron's userData path convention (see userDataDir.ts).

function notesFoldersFilePath(): string {
  return path.join(cairnUserDataDir(), "notesFolders.json");
}

function textResult(result: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }] };
}

const server = new McpServer({ name: "cairn", version: "0.1.0" });

server.registerTool(
  "add_folder",
  {
    description: "Register a folder as a Cairn notes folder, creating the directory if it doesn't exist.",
    inputSchema: {
      path: z.string().describe("Filesystem path to the notes folder"),
      name: z.string().optional().describe("Name to register it under; defaults to the folder's basename"),
    },
  },
  async ({ path: folderPath, name }) => textResult(addFolder(notesFoldersFilePath(), folderPath, name))
);

server.registerTool(
  "list_folders",
  { description: "List every registered Cairn notes folder's name and path.", inputSchema: {} },
  async () => textResult(listFolders(notesFoldersFilePath()))
);

server.registerTool(
  "get_notes",
  {
    description: "List the markdown notes in a notes folder.",
    inputSchema: {
      folder: z.string().describe("Registered notes folder name"),
      subfolders: z.boolean().optional().describe("Include notes in subfolders (default: top-level only)"),
    },
  },
  async ({ folder, subfolders }) => textResult(await getNotes(notesFoldersFilePath(), folder, Boolean(subfolders)))
);

server.registerTool(
  "get_note",
  {
    description: "Read the contents of a note.",
    inputSchema: {
      folder: z.string(),
      notePath: z.string().describe("Path relative to the notes folder root"),
    },
  },
  async ({ folder, notePath }) => textResult(await getNote(notesFoldersFilePath(), folder, notePath))
);

server.registerTool(
  "add_note",
  {
    description:
      "Create a new note with a title. Auto-renames on a title collision instead of overwriting - use set_note if you want to create-or-overwrite a note at an exact path.",
    inputSchema: {
      folder: z.string(),
      title: z.string(),
      content: z.string().optional(),
      subfolder: z.string().optional().describe("Subfolder to create the note in, created if missing"),
    },
  },
  async ({ folder, title, content, subfolder }) =>
    textResult(await addNote(notesFoldersFilePath(), folder, title, content ?? "", subfolder))
);

server.registerTool(
  "set_note",
  {
    description:
      "Create or overwrite a note at an exact path. Use this to maintain a specific memory file you expect to keep writing back to.",
    inputSchema: {
      folder: z.string(),
      notePath: z.string().describe("Path relative to the notes folder root"),
      content: z.string(),
    },
  },
  async ({ folder, notePath, content }) => textResult(await setNote(notesFoldersFilePath(), folder, notePath, content))
);

server.registerTool(
  "update_note",
  {
    description:
      "Append text to an existing note - either at the end of the file, or at the end of a specific heading's section.",
    inputSchema: {
      folder: z.string(),
      notePath: z.string(),
      content: z.string(),
      heading: z.string().optional().describe("Insert at the end of this heading's section instead of end-of-file"),
    },
  },
  async ({ folder, notePath, content, heading }) =>
    textResult(await updateNote(notesFoldersFilePath(), folder, notePath, content, heading))
);

server.registerTool(
  "delete_note",
  {
    description: "Delete a note.",
    inputSchema: {
      folder: z.string(),
      notePath: z.string().describe("Path relative to the notes folder root"),
    },
  },
  async ({ folder, notePath }) => textResult(await deleteNote(notesFoldersFilePath(), folder, notePath))
);

server.registerTool(
  "search_notes",
  {
    description: "Search note contents for a query, returning matching lines grouped by note.",
    inputSchema: {
      folder: z.string(),
      query: z.string(),
      regex: z.boolean().optional().describe("Treat query as a regular expression instead of a plain substring"),
      caseSensitive: z.boolean().optional(),
      wholeWord: z.boolean().optional().describe("Only applies in plain (non-regex) mode"),
    },
  },
  async ({ folder, query, regex, caseSensitive, wholeWord }) =>
    textResult(await searchNotes(notesFoldersFilePath(), folder, query, { regex, caseSensitive, wholeWord }))
);

// An async IIFE rather than a top-level await, since the bundler's target
// environment for this entry doesn't support top-level await.
(async () => {
  const transport = new StdioServerTransport();
  await server.connect(transport);
})();
