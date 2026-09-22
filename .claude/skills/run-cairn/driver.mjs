#!/usr/bin/env node
// Batch driver for the Cairn Electron app (see ../SKILL.md).
//
// Reads a script of newline-delimited commands from a file (or stdin with
// "-") and runs them against a single Electron process lifetime, printing
// one result line per command. There is no persistent/interactive session
// across invocations - each run launches the app fresh and closes it at
// the end (or on "quit").
//
// Commands:
//   launch [exePath]     - launch the packaged app (default: release/win-unpacked/cairn.exe)
//   wait <ms>
//   ss <path>            - screenshot the window to <path>
//   click <selector>
//   fill <selector> <text>   - set an <input>/<textarea>'s value (not for the CodeMirror editor - use type for that)
//   type <text...>       - type raw keystrokes into whatever currently has focus (e.g. after clicking into the CodeMirror editor)
//   text <selector>      - print an element's innerText
//   eval <jsExpression>  - page.evaluate(expression) in the renderer, prints the JSON result
//   key <keyName>        - press a named key, e.g. "Control+End", "Enter", "Escape"
//   sh <command>         - run a shell command mid-scenario (e.g. cairn-cli.exe to simulate an external write)
//   autodialog accept|dismiss - auto-respond to the next window.confirm/alert dialogs this way (Electron's
//                                window.confirm shows a native dialog that otherwise blocks forever with no listener)
//   quit                 - close the app (also happens automatically at end of script)
//
// Example:
//   node driver.mjs - <<'EOF'
//   launch
//   wait 800
//   ss out/01-picker.png
//   click text=Work
//   wait 1000
//   ss out/02-folder.png
//   EOF
import { _electron as electron } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

const commandsArg = process.argv[2];
const raw = commandsArg && commandsArg !== "-" ? fs.readFileSync(commandsArg, "utf-8") : fs.readFileSync(0, "utf-8");
const lines = raw
  .split("\n")
  .map((l) => l.trim())
  .filter((l) => l && !l.startsWith("#"));

let app = null;
let window = null;

function splitOnce(s) {
  const i = s.indexOf(" ");
  return i === -1 ? [s, ""] : [s.slice(0, i), s.slice(i + 1)];
}

for (const line of lines) {
  const [cmd, argStr] = splitOnce(line);
  try {
    switch (cmd) {
      case "launch": {
        const exePath = argStr || path.resolve("release/win-unpacked/cairn.exe");
        app = await electron.launch({ executablePath: exePath });
        window = await app.firstWindow();
        console.log(`[launch] ok exe=${exePath} title=${await window.title()}`);
        break;
      }
      case "wait":
        await new Promise((r) => setTimeout(r, Number(argStr)));
        console.log(`[wait] ${argStr}ms`);
        break;
      case "ss": {
        fs.mkdirSync(path.dirname(argStr), { recursive: true });
        await window.screenshot({ path: argStr });
        console.log(`[ss] saved ${argStr}`);
        break;
      }
      case "click":
        await window.click(argStr);
        console.log(`[click] ${argStr}`);
        break;
      case "fill": {
        const [selector, text] = splitOnce(argStr);
        await window.fill(selector, text);
        console.log(`[fill] ${selector}`);
        break;
      }
      case "type":
        await window.keyboard.type(argStr);
        console.log(`[type] ${argStr.length} chars`);
        break;
      case "key":
        await window.keyboard.press(argStr);
        console.log(`[key] ${argStr}`);
        break;
      case "text": {
        const t = await window.textContent(argStr);
        console.log(`[text] ${t}`);
        break;
      }
      case "eval": {
        const result = await window.evaluate(argStr);
        console.log(`[eval] ${JSON.stringify(result)}`);
        break;
      }
      case "autodialog": {
        const accept = argStr.trim() === "accept";
        window.on("dialog", (dialog) => (accept ? dialog.accept() : dialog.dismiss()));
        console.log(`[autodialog] will ${accept ? "accept" : "dismiss"} dialogs`);
        break;
      }
      case "quit":
        await app.close();
        app = null;
        console.log("[quit] closed");
        break;
      case "sh": {
        // Runs a shell command from within the same script sequence - e.g.
        // to simulate an external write to a note file mid-scenario, to
        // exercise the conflict banner (see SKILL.md).
        const out = execSync(argStr, { encoding: "utf-8" });
        console.log(`[sh] ${out.trim()}`);
        break;
      }
      default:
        console.log(`[error] unknown command: ${cmd}`);
    }
  } catch (err) {
    console.log(`[error] ${cmd} ${argStr}: ${err instanceof Error ? err.message : String(err)}`);
  }
}

if (app) await app.close().catch(() => {});
