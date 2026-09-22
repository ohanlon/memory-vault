import path from "node:path";
import { extractCliArgs, runCliCommand } from "./cli";
import { cairnUserDataDir } from "./userDataDir";

// Entry point for the standalone `cairn-cli` executable (see sea-config.json)
// - a plain Node/CLI process with no Electron runtime at all, built this way
// so running a CLI command doesn't pay Electron/Chromium's startup cost and
// end users don't need Node installed to run it (it's packaged as a
// self-contained executable via Node's Single Executable Applications
// feature - see package.json's build:cli script). It reads/writes the same
// notesFolders.json registry as the GUI app and the MCP server.

function notesFoldersFilePath(): string {
  return path.join(cairnUserDataDir(), "notesFolders.json");
}

// See electron/cliAccess.ts - a notes folder is only reachable via the CLI
// once explicitly granted access in the GUI.
function cliAccessFilePath(): string {
  return path.join(cairnUserDataDir(), "cli-access.json");
}

// Local version history for notes - see noteHistory.ts.
function historyDirPath(): string {
  return path.join(cairnUserDataDir(), "history");
}

const KNOWN_COMMANDS =
  "add_folder, get_notes, get_note, add_note, set_note, update_note, delete_note, search_notes, " +
  "get_properties, set_properties, get_backlinks, get_tags, list_folders, get_note_history, restore_note_version";

async function main(): Promise<void> {
  const cliArgs = extractCliArgs(process.argv);
  if (!cliArgs) {
    console.error(`Usage: cairn-cli <command> [options]\nCommands: ${KNOWN_COMMANDS}`);
    process.exitCode = 1;
    return;
  }

  try {
    const result = await runCliCommand(cliArgs, notesFoldersFilePath(), cliAccessFilePath(), historyDirPath());
    console.log(JSON.stringify(result, null, 2));
    process.exitCode = result.ok === false ? 1 : 0;
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exitCode = 1;
  }
}

main();
