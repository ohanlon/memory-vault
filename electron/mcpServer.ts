import path from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import {
  addFolder,
  addNote,
  deleteNote,
  deleteOrphanedAttachments,
  getBacklinks,
  getNote,
  getNoteHistory,
  getNotes,
  getOrphanedAttachments,
  getProperties,
  getTags,
  listFolders,
  restoreNoteVersion,
  searchNotes,
  setNote,
  setProperties,
  updateNote,
} from "./cli";
import { cairnUserDataDir } from "./userDataDir";

// Exposes the same operations as the `cairn-cli` CLI (electron/cli.ts) as
// MCP tools, for agents (Claude Desktop, Claude Code) to read and write a
// Cairn notes folder directly instead of shelling out.
// Runs as a standalone Node process - no Electron runtime involved - so it
// reads/writes the same notesFolders.json the packaged app uses by
// replicating Electron's userData path convention (see userDataDir.ts).

function notesFoldersFilePath(): string {
  return path.join(cairnUserDataDir(), "notesFolders.json");
}

// Every call below goes through electron/cli.ts's resolveFolder, which
// checks this file (see cliAccess.ts) - a notes folder only becomes
// reachable here once explicitly granted CLI/MCP access in the GUI.
function cliAccessFilePath(): string {
  return path.join(cairnUserDataDir(), "cli-access.json");
}

// Local version history for notes - see noteHistory.ts.
function historyDirPath(): string {
  return path.join(cairnUserDataDir(), "history");
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
  async ({ path: folderPath, name }) =>
    textResult(addFolder(notesFoldersFilePath(), cliAccessFilePath(), folderPath, name))
);

server.registerTool(
  "list_folders",
  {
    description: "List every Cairn notes folder that CLI/MCP access has been granted for.",
    inputSchema: {},
  },
  async () => textResult(listFolders(notesFoldersFilePath(), cliAccessFilePath()))
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
  async ({ folder, subfolders }) =>
    textResult(await getNotes(notesFoldersFilePath(), cliAccessFilePath(), folder, Boolean(subfolders)))
);

server.registerTool(
  "get_note",
  {
    description:
      "Read the contents of a note. The result's mtimeMs can be passed back as ifUnmodifiedSince to update_note/set_note/set_properties/delete_note to avoid clobbering a change made since this read.",
    inputSchema: {
      folder: z.string(),
      notePath: z.string().describe("Path relative to the notes folder root"),
    },
  },
  async ({ folder, notePath }) => textResult(await getNote(notesFoldersFilePath(), cliAccessFilePath(), folder, notePath))
);

server.registerTool(
  "add_note",
  {
    description:
      "Create a new note with a title. Auto-renames on a title collision instead of overwriting - use set_note if you want to create-or-overwrite a note at an exact path. Pass either content or template, not both.",
    inputSchema: {
      folder: z.string(),
      title: z.string(),
      content: z.string().optional(),
      subfolder: z.string().optional().describe("Subfolder to create the note in, created if missing"),
      template: z
        .string()
        .optional()
        .describe(
          "Name of a custom file template in this notes folder's .templates folder (see get_notes) to render instead of content - {{placeholders}} filled from values, plus {{date}}/{{time}}/{{datetime}}."
        ),
      values: z.record(z.string(), z.string()).optional().describe("Placeholder values for template's {{name}} tags"),
    },
  },
  async ({ folder, title, content, subfolder, template, values }) =>
    textResult(
      await addNote(notesFoldersFilePath(), cliAccessFilePath(), folder, title, content ?? "", subfolder, template, values)
    )
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
      ifUnmodifiedSince: z
        .number()
        .optional()
        .describe(
          "An mtimeMs from an earlier get_note/get_properties call on this note. If the note changed since, the write is rejected instead of overwriting it. Ignored when the note doesn't exist yet."
        ),
    },
  },
  async ({ folder, notePath, content, ifUnmodifiedSince }) =>
    textResult(
      await setNote(notesFoldersFilePath(), cliAccessFilePath(), historyDirPath(), folder, notePath, content, ifUnmodifiedSince)
    )
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
      ifUnmodifiedSince: z
        .number()
        .optional()
        .describe(
          "An mtimeMs from an earlier get_note/get_properties call on this note. If the note changed since, the write is rejected instead of overwriting it."
        ),
    },
  },
  async ({ folder, notePath, content, heading, ifUnmodifiedSince }) =>
    textResult(
      await updateNote(
        notesFoldersFilePath(),
        cliAccessFilePath(),
        historyDirPath(),
        folder,
        notePath,
        content,
        heading,
        ifUnmodifiedSince
      )
    )
);

server.registerTool(
  "delete_note",
  {
    description: "Delete a note.",
    inputSchema: {
      folder: z.string(),
      notePath: z.string().describe("Path relative to the notes folder root"),
      ifUnmodifiedSince: z
        .number()
        .optional()
        .describe("An mtimeMs from an earlier get_note/get_properties call. If the note changed since, the delete is rejected."),
    },
  },
  async ({ folder, notePath, ifUnmodifiedSince }) =>
    textResult(
      await deleteNote(notesFoldersFilePath(), cliAccessFilePath(), historyDirPath(), folder, notePath, ifUnmodifiedSince)
    )
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
    textResult(
      await searchNotes(notesFoldersFilePath(), cliAccessFilePath(), folder, query, {
        regex,
        caseSensitive,
        wholeWord,
      })
    )
);

server.registerTool(
  "get_backlinks",
  {
    description:
      "List notes that wikilink/markdown-link to a note (excludes notes that only share a tag - use get_tags for that).",
    inputSchema: {
      folder: z.string(),
      notePath: z.string().describe("Path relative to the notes folder root"),
    },
  },
  async ({ folder, notePath }) =>
    textResult(await getBacklinks(notesFoldersFilePath(), cliAccessFilePath(), folder, notePath))
);

server.registerTool(
  "get_tags",
  {
    description: "List every tag in a notes folder, each with the notes that carry it.",
    inputSchema: { folder: z.string() },
  },
  async ({ folder }) => textResult(await getTags(notesFoldersFilePath(), cliAccessFilePath(), folder))
);

server.registerTool(
  "get_properties",
  {
    description:
      "Read a note's frontmatter properties. The result's mtimeMs can be passed back as ifUnmodifiedSince to update_note/set_note/set_properties/delete_note to avoid clobbering a change made since this read.",
    inputSchema: {
      folder: z.string(),
      notePath: z.string().describe("Path relative to the notes folder root"),
    },
  },
  async ({ folder, notePath }) => textResult(getProperties(notesFoldersFilePath(), cliAccessFilePath(), folder, notePath))
);

server.registerTool(
  "set_properties",
  {
    description:
      "Merge values into a note's frontmatter properties (JSON Merge Patch semantics). Existing properties not mentioned are left untouched; a property set to null is removed.",
    inputSchema: {
      folder: z.string(),
      notePath: z.string().describe("Path relative to the notes folder root"),
      properties: z.record(z.string(), z.any()).describe("Properties to set; a value of null removes that key"),
      ifUnmodifiedSince: z
        .number()
        .optional()
        .describe(
          "An mtimeMs from an earlier get_note/get_properties call on this note. If the note changed since, the write is rejected instead of overwriting it."
        ),
    },
  },
  async ({ folder, notePath, properties, ifUnmodifiedSince }) =>
    textResult(setProperties(notesFoldersFilePath(), cliAccessFilePath(), folder, notePath, properties, ifUnmodifiedSince))
);

server.registerTool(
  "get_note_history",
  {
    description:
      "List local version snapshots recorded for a note, newest first. Each entry's timestamp can be passed to restore_note_version.",
    inputSchema: {
      folder: z.string(),
      notePath: z.string().describe("Path relative to the notes folder root"),
    },
  },
  async ({ folder, notePath }) =>
    textResult(getNoteHistory(notesFoldersFilePath(), cliAccessFilePath(), historyDirPath(), folder, notePath))
);

server.registerTool(
  "restore_note_version",
  {
    description:
      "Overwrite a note with one of its recorded history snapshots (see get_note_history). The note's current content is itself snapshotted first, so this can be undone.",
    inputSchema: {
      folder: z.string(),
      notePath: z.string().describe("Path relative to the notes folder root"),
      timestamp: z.string().describe("A timestamp from get_note_history"),
      ifUnmodifiedSince: z
        .number()
        .optional()
        .describe("An mtimeMs from an earlier get_note/get_properties call. If the note changed since, the restore is rejected."),
    },
  },
  async ({ folder, notePath, timestamp, ifUnmodifiedSince }) =>
    textResult(
      await restoreNoteVersion(
        notesFoldersFilePath(),
        cliAccessFilePath(),
        historyDirPath(),
        folder,
        notePath,
        timestamp,
        ifUnmodifiedSince
      )
    )
);

server.registerTool(
  "get_orphaned_attachments",
  {
    description:
      "List attachments (files under the notes folder's attachments/ folder) that no note currently embeds via ![](path) - candidates for delete_orphaned_attachments.",
    inputSchema: { folder: z.string() },
  },
  async ({ folder }) => textResult(await getOrphanedAttachments(notesFoldersFilePath(), cliAccessFilePath(), folder))
);

server.registerTool(
  "delete_orphaned_attachments",
  {
    description: "Delete every attachment no note currently embeds (recomputed fresh, see get_orphaned_attachments).",
    inputSchema: { folder: z.string() },
  },
  async ({ folder }) => textResult(await deleteOrphanedAttachments(notesFoldersFilePath(), cliAccessFilePath(), folder))
);

// An async IIFE rather than a top-level await, since the bundler's target
// environment for this entry doesn't support top-level await.
(async () => {
  const transport = new StdioServerTransport();
  await server.connect(transport);
})();
