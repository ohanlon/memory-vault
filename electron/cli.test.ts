import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { extractCliArgs, runCliCommand } from "./cli";
import { readSnapshot } from "./noteHistory";
import { writeNotesFoldersFile } from "./notesFolderRegistry";

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "cairn-cli-test-"));
let counter = 0;
function tmpDir(): string {
  counter += 1;
  return path.join(tmpRoot, `case-${counter}`);
}

// A cli-access.json granting CLI/MCP access to "Work" - the folder name
// nearly every test below registers. Tests that exercise add_folder or an
// unknown-folder error don't need the grant to matter (add_folder doesn't
// check access, and an unknown folder is rejected before access is even
// checked), so using this same helper everywhere keeps every call site
// uniform.
function accessFile(): string {
  const dir = tmpDir();
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, "cli-access.json");
  fs.writeFileSync(file, JSON.stringify({ allowed: ["Work"] }), "utf-8");
  return file;
}

afterEach(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
  fs.mkdirSync(tmpRoot, { recursive: true });
  counter = 0;
});

describe("extractCliArgs", () => {
  it("returns null when no known command is present (normal GUI launch)", () => {
    expect(extractCliArgs(["/path/to/electron", "/path/to/app"])).toBeNull();
  });

  it("finds the command regardless of how many argv entries precede it (dev vs packaged)", () => {
    expect(extractCliArgs(["/path/to/electron", "/path/to/app", "list_folders"])).toEqual(["list_folders"]);
    expect(extractCliArgs(["/path/to/cairn.exe", "add_folder", "/notes"])).toEqual(["add_folder", "/notes"]);
  });
});

describe("runCliCommand: add_folder", () => {
  it("creates the folder on disk and registers it under its base name", async () => {
    const notesFoldersFile = path.join(tmpDir(), "notesFolders.json");
    const folderPath = path.join(tmpDir(), "Work");

    const result = await runCliCommand(["add_folder", folderPath], notesFoldersFile, accessFile());

    expect(result.ok).toBe(true);
    expect(result.alreadyExists).toBe(false);
    expect(result.name).toBe("Work");
    expect(fs.existsSync(folderPath)).toBe(true);
  });

  it("uses a provided --name instead of the folder's basename", async () => {
    const notesFoldersFile = path.join(tmpDir(), "notesFolders.json");
    const folderPath = path.join(tmpDir(), "some-dir");

    const result = await runCliCommand(["add_folder", folderPath, "--name", "My Notes"], notesFoldersFile, accessFile());

    expect(result.name).toBe("My Notes");
  });

  it("reports the folder is already registered when the same root is added twice", async () => {
    const notesFoldersFile = path.join(tmpDir(), "notesFolders.json");
    const folderPath = path.join(tmpDir(), "Work");

    await runCliCommand(["add_folder", folderPath], notesFoldersFile, accessFile());
    const second = await runCliCommand(["add_folder", folderPath], notesFoldersFile, accessFile());

    expect(second.alreadyExists).toBe(true);
    expect(second.name).toBe("Work");
  });

  it("avoids a name collision by picking a new name and reporting it", async () => {
    const notesFoldersFile = path.join(tmpDir(), "notesFolders.json");
    const dir = tmpDir();

    await runCliCommand(["add_folder", path.join(dir, "a")], notesFoldersFile, accessFile());
    const result = await runCliCommand(["add_folder", path.join(dir, "b"), "--name", "a"], notesFoldersFile, accessFile());

    expect(result.name).toBe("a 2");
    expect(result.renamed).toBe(true);
  });

  it("auto-grants CLI/MCP access to a brand-new folder it registers", async () => {
    const notesFoldersFile = path.join(tmpDir(), "notesFolders.json");
    const root = tmpDir();
    const ungranted = path.join(tmpDir(), "cli-access.json"); // no prior grants

    await runCliCommand(["add_folder", root, "--name", "Work"], notesFoldersFile, ungranted);
    const result = await runCliCommand(["get_notes", "--folder", "Work"], notesFoldersFile, ungranted);

    expect(result.ok).toBe(true);
  });

  it("does not auto-grant access when the folder was already registered", async () => {
    const notesFoldersFile = path.join(tmpDir(), "notesFolders.json");
    const root = tmpDir();
    const firstAccessFile = path.join(tmpDir(), "cli-access.json");
    await runCliCommand(["add_folder", root, "--name", "Work"], notesFoldersFile, firstAccessFile);

    // A second, unrelated CLI/MCP "session" (its own access file, nothing
    // granted yet) registers the *same* already-registered folder again.
    const secondAccessFile = path.join(tmpDir(), "cli-access.json");
    const addResult = await runCliCommand(["add_folder", root, "--name", "Work"], notesFoldersFile, secondAccessFile);
    expect(addResult.alreadyExists).toBe(true);

    await expect(
      runCliCommand(["get_notes", "--folder", "Work"], notesFoldersFile, secondAccessFile)
    ).rejects.toThrow(/has not been granted/);
  });
});

describe("runCliCommand: CLI/MCP access gating", () => {
  it("rejects an operation on a registered folder that hasn't been granted access", async () => {
    const notesFoldersFile = path.join(tmpDir(), "notesFolders.json");
    const root = tmpDir();
    fs.mkdirSync(root, { recursive: true });
    writeNotesFoldersFile(notesFoldersFile, [{ name: "Work", root }]);
    const ungranted = path.join(tmpDir(), "cli-access.json"); // never written - no grants

    await expect(runCliCommand(["get_notes", "--folder", "Work"], notesFoldersFile, ungranted)).rejects.toThrow(
      /has not been granted/
    );
  });

  it("succeeds once the folder is granted access", async () => {
    const notesFoldersFile = path.join(tmpDir(), "notesFolders.json");
    const root = tmpDir();
    fs.mkdirSync(root, { recursive: true });
    writeNotesFoldersFile(notesFoldersFile, [{ name: "Work", root }]);

    const result = await runCliCommand(["get_notes", "--folder", "Work"], notesFoldersFile, accessFile());

    expect(result.ok).toBe(true);
  });
});

describe("runCliCommand: list_folders", () => {
  it("lists registered notes folders", async () => {
    const notesFoldersFile = path.join(tmpDir(), "notesFolders.json");
    writeNotesFoldersFile(notesFoldersFile, [{ name: "Work", root: "/notes/work" }]);

    const result = await runCliCommand(["list_folders"], notesFoldersFile, accessFile());

    expect(result.folders).toEqual([{ name: "Work", root: "/notes/work" }]);
  });

  it("omits registered folders that haven't been granted CLI/MCP access", async () => {
    const notesFoldersFile = path.join(tmpDir(), "notesFolders.json");
    writeNotesFoldersFile(notesFoldersFile, [
      { name: "Work", root: "/notes/work" },
      { name: "Personal", root: "/notes/personal" },
    ]);

    // accessFile() only grants "Work" - "Personal" is registered but ungranted.
    const result = await runCliCommand(["list_folders"], notesFoldersFile, accessFile());

    expect(result.folders).toEqual([{ name: "Work", root: "/notes/work" }]);
  });
});

describe("runCliCommand: get_notes", () => {
  it("lists top-level notes only by default", async () => {
    const notesFoldersFile = path.join(tmpDir(), "notesFolders.json");
    const root = tmpDir();
    fs.mkdirSync(path.join(root, "Sub"), { recursive: true });
    fs.writeFileSync(path.join(root, "A.md"), "a", "utf-8");
    fs.writeFileSync(path.join(root, "Sub", "B.md"), "b", "utf-8");
    writeNotesFoldersFile(notesFoldersFile, [{ name: "Work", root }]);

    const result = await runCliCommand(["get_notes", "--folder", "Work"], notesFoldersFile, accessFile());

    expect(result.notes).toEqual(["A.md"]);
  });

  it("includes notes from subfolders with --subfolders", async () => {
    const notesFoldersFile = path.join(tmpDir(), "notesFolders.json");
    const root = tmpDir();
    fs.mkdirSync(path.join(root, "Sub"), { recursive: true });
    fs.writeFileSync(path.join(root, "A.md"), "a", "utf-8");
    fs.writeFileSync(path.join(root, "Sub", "B.md"), "b", "utf-8");
    writeNotesFoldersFile(notesFoldersFile, [{ name: "Work", root }]);

    const result = await runCliCommand(["get_notes", "--folder", "Work", "--subfolders"], notesFoldersFile, accessFile());

    expect((result.notes as string[]).sort()).toEqual(["A.md", path.join("Sub", "B.md")].sort());
  });

  it("throws when the notes folder name is unknown", async () => {
    const notesFoldersFile = path.join(tmpDir(), "notesFolders.json");
    await expect(runCliCommand(["get_notes", "--folder", "Missing"], notesFoldersFile, accessFile())).rejects.toThrow(
      /No notes folder named/
    );
  });
});

describe("runCliCommand: get_note", () => {
  it("returns the note's contents", async () => {
    const notesFoldersFile = path.join(tmpDir(), "notesFolders.json");
    const root = tmpDir();
    fs.mkdirSync(root, { recursive: true });
    fs.writeFileSync(path.join(root, "A.md"), "hello", "utf-8");
    writeNotesFoldersFile(notesFoldersFile, [{ name: "Work", root }]);

    const result = await runCliCommand(["get_note", "--folder", "Work", "A.md"], notesFoldersFile, accessFile());

    expect(result.ok).toBe(true);
    expect(result.content).toBe("hello");
  });

  it("includes the note's mtime", async () => {
    const notesFoldersFile = path.join(tmpDir(), "notesFolders.json");
    const root = tmpDir();
    fs.mkdirSync(root, { recursive: true });
    fs.writeFileSync(path.join(root, "A.md"), "hello", "utf-8");
    writeNotesFoldersFile(notesFoldersFile, [{ name: "Work", root }]);

    const result = await runCliCommand(["get_note", "--folder", "Work", "A.md"], notesFoldersFile, accessFile());

    expect(result.mtimeMs).toBe(fs.statSync(path.join(root, "A.md")).mtimeMs);
  });

  it("reports when the note does not exist instead of throwing", async () => {
    const notesFoldersFile = path.join(tmpDir(), "notesFolders.json");
    const root = tmpDir();
    fs.mkdirSync(root, { recursive: true });
    writeNotesFoldersFile(notesFoldersFile, [{ name: "Work", root }]);

    const result = await runCliCommand(["get_note", "--folder", "Work", "Missing.md"], notesFoldersFile, accessFile());

    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/does not exist/);
  });
});

describe("runCliCommand: add_note", () => {
  it("creates a note with the given content", async () => {
    const notesFoldersFile = path.join(tmpDir(), "notesFolders.json");
    const root = tmpDir();
    fs.mkdirSync(root, { recursive: true });
    writeNotesFoldersFile(notesFoldersFile, [{ name: "Work", root }]);

    const result = await runCliCommand(
      ["add_note", "--folder", "Work", "My Note", "--content", "hello world"],
      notesFoldersFile,
      accessFile()
    );

    expect(result.ok).toBe(true);
    expect(result.note).toBe("My Note.md");
    expect(fs.readFileSync(path.join(root, "My Note.md"), "utf-8")).toBe("hello world");
  });

  it("creates a missing subfolder and places the note inside it", async () => {
    const notesFoldersFile = path.join(tmpDir(), "notesFolders.json");
    const root = tmpDir();
    fs.mkdirSync(root, { recursive: true });
    writeNotesFoldersFile(notesFoldersFile, [{ name: "Work", root }]);

    const result = await runCliCommand(
      ["add_note", "--folder", "Work", "My Note", "--subfolder", "Projects"],
      notesFoldersFile,
      accessFile()
    );

    expect(result.note).toBe(path.join("Projects", "My Note.md"));
    expect(fs.existsSync(path.join(root, "Projects", "My Note.md"))).toBe(true);
  });

  it("avoids a note name collision by picking a new name and reporting it", async () => {
    const notesFoldersFile = path.join(tmpDir(), "notesFolders.json");
    const root = tmpDir();
    fs.mkdirSync(root, { recursive: true });
    fs.writeFileSync(path.join(root, "My Note.md"), "existing", "utf-8");
    writeNotesFoldersFile(notesFoldersFile, [{ name: "Work", root }]);

    const result = await runCliCommand(["add_note", "--folder", "Work", "My Note"], notesFoldersFile, accessFile());

    expect(result.note).toBe("My Note 1.md");
    expect(result.renamed).toBe(true);
  });

  it("reads multiline content from --content-file", async () => {
    const notesFoldersFile = path.join(tmpDir(), "notesFolders.json");
    const root = tmpDir();
    fs.mkdirSync(root, { recursive: true });
    writeNotesFoldersFile(notesFoldersFile, [{ name: "Work", root }]);
    const contentFile = path.join(tmpDir(), "content.txt");
    fs.mkdirSync(path.dirname(contentFile), { recursive: true });
    fs.writeFileSync(contentFile, "line one\nline two", "utf-8");

    const result = await runCliCommand(
      ["add_note", "--folder", "Work", "My Note", "--content-file", contentFile],
      notesFoldersFile,
      accessFile()
    );

    expect(result.ok).toBe(true);
    expect(fs.readFileSync(path.join(root, "My Note.md"), "utf-8")).toBe("line one\nline two");
  });

  it("rejects both --content and --content-file together", async () => {
    const notesFoldersFile = path.join(tmpDir(), "notesFolders.json");
    const root = tmpDir();
    fs.mkdirSync(root, { recursive: true });
    writeNotesFoldersFile(notesFoldersFile, [{ name: "Work", root }]);
    const contentFile = path.join(tmpDir(), "content.txt");
    fs.mkdirSync(path.dirname(contentFile), { recursive: true });
    fs.writeFileSync(contentFile, "text", "utf-8");

    await expect(
      runCliCommand(
        ["add_note", "--folder", "Work", "My Note", "--content", "x", "--content-file", contentFile],
        notesFoldersFile,
      accessFile()
      )
    ).rejects.toThrow(/either --content or --content-file/);
  });

  it("reports a clear error when --content-file does not exist", async () => {
    const notesFoldersFile = path.join(tmpDir(), "notesFolders.json");
    const root = tmpDir();
    fs.mkdirSync(root, { recursive: true });
    writeNotesFoldersFile(notesFoldersFile, [{ name: "Work", root }]);

    await expect(
      runCliCommand(
        ["add_note", "--folder", "Work", "My Note", "--content-file", path.join(tmpDir(), "missing.txt")],
        notesFoldersFile,
      accessFile()
      )
    ).rejects.toThrow(/does not exist/);
  });
});

describe("runCliCommand: update_note", () => {
  it("appends the given text to an existing note, adding a newline separator", async () => {
    const notesFoldersFile = path.join(tmpDir(), "notesFolders.json");
    const root = tmpDir();
    fs.mkdirSync(root, { recursive: true });
    fs.writeFileSync(path.join(root, "A.md"), "line one", "utf-8");
    writeNotesFoldersFile(notesFoldersFile, [{ name: "Work", root }]);

    const result = await runCliCommand(
      ["update_note", "--folder", "Work", "A.md", "--content", "line two"],
      notesFoldersFile,
      accessFile()
    );

    expect(result.ok).toBe(true);
    expect(result.content).toBe("line one\nline two");
    expect(fs.readFileSync(path.join(root, "A.md"), "utf-8")).toBe("line one\nline two");
  });

  it("does not add an extra newline when the note already ends with one", async () => {
    const notesFoldersFile = path.join(tmpDir(), "notesFolders.json");
    const root = tmpDir();
    fs.mkdirSync(root, { recursive: true });
    fs.writeFileSync(path.join(root, "A.md"), "line one\n", "utf-8");
    writeNotesFoldersFile(notesFoldersFile, [{ name: "Work", root }]);

    const result = await runCliCommand(
      ["update_note", "--folder", "Work", "A.md", "--content", "line two"],
      notesFoldersFile,
      accessFile()
    );

    expect(result.content).toBe("line one\nline two");
  });

  it("reports when the note does not exist instead of throwing", async () => {
    const notesFoldersFile = path.join(tmpDir(), "notesFolders.json");
    const root = tmpDir();
    fs.mkdirSync(root, { recursive: true });
    writeNotesFoldersFile(notesFoldersFile, [{ name: "Work", root }]);

    const result = await runCliCommand(
      ["update_note", "--folder", "Work", "Missing.md", "--content", "text"],
      notesFoldersFile,
      accessFile()
    );

    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/does not exist/);
  });

  it("appends multiline content from --content-file", async () => {
    const notesFoldersFile = path.join(tmpDir(), "notesFolders.json");
    const root = tmpDir();
    fs.mkdirSync(root, { recursive: true });
    fs.writeFileSync(path.join(root, "A.md"), "line one", "utf-8");
    writeNotesFoldersFile(notesFoldersFile, [{ name: "Work", root }]);
    const contentFile = path.join(tmpDir(), "content.txt");
    fs.mkdirSync(path.dirname(contentFile), { recursive: true });
    fs.writeFileSync(contentFile, "line two\nline three", "utf-8");

    const result = await runCliCommand(
      ["update_note", "--folder", "Work", "A.md", "--content-file", contentFile],
      notesFoldersFile,
      accessFile()
    );

    expect(result.content).toBe("line one\nline two\nline three");
  });

  it("requires either --content or --content-file", async () => {
    const notesFoldersFile = path.join(tmpDir(), "notesFolders.json");
    const root = tmpDir();
    fs.mkdirSync(root, { recursive: true });
    fs.writeFileSync(path.join(root, "A.md"), "line one", "utf-8");
    writeNotesFoldersFile(notesFoldersFile, [{ name: "Work", root }]);

    await expect(runCliCommand(["update_note", "--folder", "Work", "A.md"], notesFoldersFile, accessFile())).rejects.toThrow(
      /Usage: update_note/
    );
  });

  it("inserts at the end of a heading's section with --heading", async () => {
    const notesFoldersFile = path.join(tmpDir(), "notesFolders.json");
    const root = tmpDir();
    fs.mkdirSync(root, { recursive: true });
    fs.writeFileSync(
      path.join(root, "A.md"),
      ["# Notes", "", "## Preferences", "- likes tabs", "", "## Other", "- unrelated"].join("\n"),
      "utf-8"
    );
    writeNotesFoldersFile(notesFoldersFile, [{ name: "Work", root }]);

    const result = await runCliCommand(
      ["update_note", "--folder", "Work", "A.md", "--content", "- likes dark mode", "--heading", "Preferences"],
      notesFoldersFile,
      accessFile()
    );

    expect(result.ok).toBe(true);
    expect(result.content).toBe(
      ["# Notes", "", "## Preferences", "- likes tabs", "- likes dark mode", "", "## Other", "- unrelated"].join("\n")
    );
  });

  it("inserts at the end of the note when the matching heading is the last section", async () => {
    const notesFoldersFile = path.join(tmpDir(), "notesFolders.json");
    const root = tmpDir();
    fs.mkdirSync(root, { recursive: true });
    fs.writeFileSync(path.join(root, "A.md"), ["## Preferences", "- likes tabs"].join("\n"), "utf-8");
    writeNotesFoldersFile(notesFoldersFile, [{ name: "Work", root }]);

    const result = await runCliCommand(
      ["update_note", "--folder", "Work", "A.md", "--content", "- likes dark mode", "--heading", "Preferences"],
      notesFoldersFile,
      accessFile()
    );

    expect(result.content).toBe(["## Preferences", "- likes tabs", "- likes dark mode"].join("\n"));
  });

  it("matches headings case-insensitively", async () => {
    const notesFoldersFile = path.join(tmpDir(), "notesFolders.json");
    const root = tmpDir();
    fs.mkdirSync(root, { recursive: true });
    fs.writeFileSync(path.join(root, "A.md"), "## Preferences\n- a", "utf-8");
    writeNotesFoldersFile(notesFoldersFile, [{ name: "Work", root }]);

    const result = await runCliCommand(
      ["update_note", "--folder", "Work", "A.md", "--content", "- b", "--heading", "preferences"],
      notesFoldersFile,
      accessFile()
    );

    expect(result.content).toBe("## Preferences\n- a\n- b");
  });

  it("reports when the heading does not exist instead of throwing", async () => {
    const notesFoldersFile = path.join(tmpDir(), "notesFolders.json");
    const root = tmpDir();
    fs.mkdirSync(root, { recursive: true });
    fs.writeFileSync(path.join(root, "A.md"), "## Preferences\n- a", "utf-8");
    writeNotesFoldersFile(notesFoldersFile, [{ name: "Work", root }]);

    const result = await runCliCommand(
      ["update_note", "--folder", "Work", "A.md", "--content", "- b", "--heading", "Missing"],
      notesFoldersFile,
      accessFile()
    );

    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/Heading "Missing" was not found/);
  });
});

describe("runCliCommand: set_note", () => {
  it("creates the note when it doesn't exist", async () => {
    const notesFoldersFile = path.join(tmpDir(), "notesFolders.json");
    const root = tmpDir();
    fs.mkdirSync(root, { recursive: true });
    writeNotesFoldersFile(notesFoldersFile, [{ name: "Work", root }]);

    const result = await runCliCommand(
      ["set_note", "--folder", "Work", "Prefs.md", "--content", "hello"],
      notesFoldersFile,
      accessFile()
    );

    expect(result.ok).toBe(true);
    expect(result.created).toBe(true);
    expect(fs.readFileSync(path.join(root, "Prefs.md"), "utf-8")).toBe("hello");
  });

  it("overwrites the note in place when it already exists, without renaming", async () => {
    const notesFoldersFile = path.join(tmpDir(), "notesFolders.json");
    const root = tmpDir();
    fs.mkdirSync(root, { recursive: true });
    fs.writeFileSync(path.join(root, "Prefs.md"), "old content", "utf-8");
    writeNotesFoldersFile(notesFoldersFile, [{ name: "Work", root }]);

    const result = await runCliCommand(
      ["set_note", "--folder", "Work", "Prefs.md", "--content", "new content"],
      notesFoldersFile,
      accessFile()
    );

    expect(result.created).toBe(false);
    expect(result.note).toBe("Prefs.md");
    expect(fs.readFileSync(path.join(root, "Prefs.md"), "utf-8")).toBe("new content");
  });

  it("creates a missing parent directory", async () => {
    const notesFoldersFile = path.join(tmpDir(), "notesFolders.json");
    const root = tmpDir();
    fs.mkdirSync(root, { recursive: true });
    writeNotesFoldersFile(notesFoldersFile, [{ name: "Work", root }]);

    await runCliCommand(
      ["set_note", "--folder", "Work", path.join("Nested", "Prefs.md"), "--content", "hello"],
      notesFoldersFile,
      accessFile()
    );

    expect(fs.existsSync(path.join(root, "Nested", "Prefs.md"))).toBe(true);
  });

  it("refuses to write outside the notes folder", async () => {
    const notesFoldersFile = path.join(tmpDir(), "notesFolders.json");
    const root = tmpDir();
    fs.mkdirSync(root, { recursive: true });
    writeNotesFoldersFile(notesFoldersFile, [{ name: "Work", root }]);

    await expect(
      runCliCommand(["set_note", "--folder", "Work", "../outside.md", "--content", "x"], notesFoldersFile, accessFile())
    ).rejects.toThrow(/escapes/);
  });
});

describe("runCliCommand: search_notes", () => {
  it("returns matching lines grouped by note", async () => {
    const notesFoldersFile = path.join(tmpDir(), "notesFolders.json");
    const root = tmpDir();
    fs.mkdirSync(root, { recursive: true });
    fs.writeFileSync(path.join(root, "A.md"), "likes dark mode\nsomething else", "utf-8");
    fs.writeFileSync(path.join(root, "B.md"), "no match here", "utf-8");
    writeNotesFoldersFile(notesFoldersFile, [{ name: "Work", root }]);

    const result = await runCliCommand(["search_notes", "--folder", "Work", "dark mode"], notesFoldersFile, accessFile());

    expect(result.ok).toBe(true);
    expect(result.results).toEqual([
      { note: "A.md", matches: [{ line: 1, lineText: "likes dark mode", start: 6, end: 15 }] },
    ]);
  });

  it("searches subfolders too", async () => {
    const notesFoldersFile = path.join(tmpDir(), "notesFolders.json");
    const root = tmpDir();
    fs.mkdirSync(path.join(root, "Sub"), { recursive: true });
    fs.writeFileSync(path.join(root, "Sub", "A.md"), "target text", "utf-8");
    writeNotesFoldersFile(notesFoldersFile, [{ name: "Work", root }]);

    const result = await runCliCommand(["search_notes", "--folder", "Work", "target"], notesFoldersFile, accessFile());

    expect((result.results as { note: string }[])[0].note).toBe(path.join("Sub", "A.md"));
  });

  it("supports regex mode", async () => {
    const notesFoldersFile = path.join(tmpDir(), "notesFolders.json");
    const root = tmpDir();
    fs.mkdirSync(root, { recursive: true });
    fs.writeFileSync(path.join(root, "A.md"), "foo123bar", "utf-8");
    writeNotesFoldersFile(notesFoldersFile, [{ name: "Work", root }]);

    const result = await runCliCommand(
      ["search_notes", "--folder", "Work", "\\d+", "--regex"],
      notesFoldersFile,
      accessFile()
    );

    expect((result.results as { matches: unknown[] }[])[0].matches).toHaveLength(1);
  });

  it("returns an empty results list when nothing matches", async () => {
    const notesFoldersFile = path.join(tmpDir(), "notesFolders.json");
    const root = tmpDir();
    fs.mkdirSync(root, { recursive: true });
    fs.writeFileSync(path.join(root, "A.md"), "nothing relevant", "utf-8");
    writeNotesFoldersFile(notesFoldersFile, [{ name: "Work", root }]);

    const result = await runCliCommand(["search_notes", "--folder", "Work", "missing"], notesFoldersFile, accessFile());

    expect(result.results).toEqual([]);
  });

  it("throws when the notes folder name is unknown", async () => {
    const notesFoldersFile = path.join(tmpDir(), "notesFolders.json");
    await expect(runCliCommand(["search_notes", "--folder", "Missing", "text"], notesFoldersFile, accessFile())).rejects.toThrow(
      /No notes folder named/
    );
  });
});

describe("runCliCommand: delete_note", () => {
  it("deletes an existing note", async () => {
    const notesFoldersFile = path.join(tmpDir(), "notesFolders.json");
    const root = tmpDir();
    fs.mkdirSync(root, { recursive: true });
    fs.writeFileSync(path.join(root, "A.md"), "content", "utf-8");
    writeNotesFoldersFile(notesFoldersFile, [{ name: "Work", root }]);

    const result = await runCliCommand(["delete_note", "--folder", "Work", "A.md"], notesFoldersFile, accessFile());

    expect(result.ok).toBe(true);
    expect(fs.existsSync(path.join(root, "A.md"))).toBe(false);
  });

  it("reports when the note does not exist instead of throwing", async () => {
    const notesFoldersFile = path.join(tmpDir(), "notesFolders.json");
    const root = tmpDir();
    fs.mkdirSync(root, { recursive: true });
    writeNotesFoldersFile(notesFoldersFile, [{ name: "Work", root }]);

    const result = await runCliCommand(["delete_note", "--folder", "Work", "Missing.md"], notesFoldersFile, accessFile());

    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/does not exist/);
  });

  it("throws when the notes folder name is unknown", async () => {
    const notesFoldersFile = path.join(tmpDir(), "notesFolders.json");
    await expect(runCliCommand(["delete_note", "--folder", "Missing", "A.md"], notesFoldersFile, accessFile())).rejects.toThrow(
      /No notes folder named/
    );
  });

  it("refuses to delete a path outside the notes folder", async () => {
    const notesFoldersFile = path.join(tmpDir(), "notesFolders.json");
    const root = tmpDir();
    fs.mkdirSync(root, { recursive: true });
    writeNotesFoldersFile(notesFoldersFile, [{ name: "Work", root }]);

    await expect(
      runCliCommand(["delete_note", "--folder", "Work", "../outside.md"], notesFoldersFile, accessFile())
    ).rejects.toThrow(/escapes/);
  });
});

describe("runCliCommand: get_properties", () => {
  it("returns the note's frontmatter", async () => {
    const notesFoldersFile = path.join(tmpDir(), "notesFolders.json");
    const root = tmpDir();
    fs.mkdirSync(root, { recursive: true });
    fs.writeFileSync(path.join(root, "A.md"), "---\nstatus: active\npriority: 2\n---\nBody text", "utf-8");
    writeNotesFoldersFile(notesFoldersFile, [{ name: "Work", root }]);

    const result = await runCliCommand(["get_properties", "--folder", "Work", "A.md"], notesFoldersFile, accessFile());

    expect(result.ok).toBe(true);
    expect(result.properties).toEqual({ status: "active", priority: 2 });
  });

  it("returns an empty object for a note with no frontmatter", async () => {
    const notesFoldersFile = path.join(tmpDir(), "notesFolders.json");
    const root = tmpDir();
    fs.mkdirSync(root, { recursive: true });
    fs.writeFileSync(path.join(root, "A.md"), "just body text", "utf-8");
    writeNotesFoldersFile(notesFoldersFile, [{ name: "Work", root }]);

    const result = await runCliCommand(["get_properties", "--folder", "Work", "A.md"], notesFoldersFile, accessFile());

    expect(result.properties).toEqual({});
  });

  it("reports when the note does not exist instead of throwing", async () => {
    const notesFoldersFile = path.join(tmpDir(), "notesFolders.json");
    const root = tmpDir();
    fs.mkdirSync(root, { recursive: true });
    writeNotesFoldersFile(notesFoldersFile, [{ name: "Work", root }]);

    const result = await runCliCommand(["get_properties", "--folder", "Work", "Missing.md"], notesFoldersFile, accessFile());

    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/does not exist/);
  });
});

describe("runCliCommand: set_properties", () => {
  it("adds new properties to a note with none, preserving the body", async () => {
    const notesFoldersFile = path.join(tmpDir(), "notesFolders.json");
    const root = tmpDir();
    fs.mkdirSync(root, { recursive: true });
    fs.writeFileSync(path.join(root, "A.md"), "Body text", "utf-8");
    writeNotesFoldersFile(notesFoldersFile, [{ name: "Work", root }]);

    const result = await runCliCommand(
      ["set_properties", "--folder", "Work", "A.md", "--json", '{"status":"active"}'],
      notesFoldersFile,
      accessFile()
    );

    expect(result.ok).toBe(true);
    expect(result.properties).toEqual({ status: "active" });
    const raw = fs.readFileSync(path.join(root, "A.md"), "utf-8");
    expect(raw).toContain("status: active");
    expect(raw).toContain("Body text");
  });

  it("merges into existing properties, leaving unmentioned keys alone", async () => {
    const notesFoldersFile = path.join(tmpDir(), "notesFolders.json");
    const root = tmpDir();
    fs.mkdirSync(root, { recursive: true });
    fs.writeFileSync(path.join(root, "A.md"), "---\nstatus: active\npriority: 2\n---\nBody", "utf-8");
    writeNotesFoldersFile(notesFoldersFile, [{ name: "Work", root }]);

    const result = await runCliCommand(
      ["set_properties", "--folder", "Work", "A.md", "--json", '{"status":"done"}'],
      notesFoldersFile,
      accessFile()
    );

    expect(result.properties).toEqual({ status: "done", priority: 2 });
  });

  it("removes a key when its value is null", async () => {
    const notesFoldersFile = path.join(tmpDir(), "notesFolders.json");
    const root = tmpDir();
    fs.mkdirSync(root, { recursive: true });
    fs.writeFileSync(path.join(root, "A.md"), "---\nstatus: active\npriority: 2\n---\nBody", "utf-8");
    writeNotesFoldersFile(notesFoldersFile, [{ name: "Work", root }]);

    const result = await runCliCommand(
      ["set_properties", "--folder", "Work", "A.md", "--json", '{"priority":null}'],
      notesFoldersFile,
      accessFile()
    );

    expect(result.properties).toEqual({ status: "active" });
  });

  it("reports a validation warning but still saves an out-of-range value", async () => {
    const notesFoldersFile = path.join(tmpDir(), "notesFolders.json");
    const root = tmpDir();
    fs.mkdirSync(root, { recursive: true });
    fs.mkdirSync(path.join(root, ".cairn"), { recursive: true });
    fs.writeFileSync(
      path.join(root, ".cairn", "properties.yaml"),
      "properties:\n  - name: priority\n    type: number\n    rules:\n      min: 1\n      max: 5\n",
      "utf-8"
    );
    fs.writeFileSync(path.join(root, "A.md"), "Body", "utf-8");
    writeNotesFoldersFile(notesFoldersFile, [{ name: "Work", root }]);

    const result = await runCliCommand(
      ["set_properties", "--folder", "Work", "A.md", "--json", '{"priority":9}'],
      notesFoldersFile,
      accessFile()
    );

    expect(result.ok).toBe(true);
    expect(result.properties).toEqual({ priority: 9 });
    expect(result.warnings).toEqual({ priority: "Must be at most 5" });
  });

  it("reports when the note does not exist instead of throwing", async () => {
    const notesFoldersFile = path.join(tmpDir(), "notesFolders.json");
    const root = tmpDir();
    fs.mkdirSync(root, { recursive: true });
    writeNotesFoldersFile(notesFoldersFile, [{ name: "Work", root }]);

    const result = await runCliCommand(
      ["set_properties", "--folder", "Work", "Missing.md", "--json", '{"status":"active"}'],
      notesFoldersFile,
      accessFile()
    );

    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/does not exist/);
  });

  it("rejects invalid JSON", async () => {
    const notesFoldersFile = path.join(tmpDir(), "notesFolders.json");
    const root = tmpDir();
    fs.mkdirSync(root, { recursive: true });
    fs.writeFileSync(path.join(root, "A.md"), "Body", "utf-8");
    writeNotesFoldersFile(notesFoldersFile, [{ name: "Work", root }]);

    await expect(
      runCliCommand(["set_properties", "--folder", "Work", "A.md", "--json", "{not valid"], notesFoldersFile, accessFile())
    ).rejects.toThrow(/must be valid JSON/);
  });

  it("rejects a JSON value that isn't an object", async () => {
    const notesFoldersFile = path.join(tmpDir(), "notesFolders.json");
    const root = tmpDir();
    fs.mkdirSync(root, { recursive: true });
    fs.writeFileSync(path.join(root, "A.md"), "Body", "utf-8");
    writeNotesFoldersFile(notesFoldersFile, [{ name: "Work", root }]);

    await expect(
      runCliCommand(["set_properties", "--folder", "Work", "A.md", "--json", "[1,2,3]"], notesFoldersFile, accessFile())
    ).rejects.toThrow(/must be a JSON object/);
  });
});

describe("runCliCommand: get_backlinks", () => {
  it("returns notes that wikilink to the target note", async () => {
    const notesFoldersFile = path.join(tmpDir(), "notesFolders.json");
    const root = tmpDir();
    fs.mkdirSync(root, { recursive: true });
    fs.writeFileSync(path.join(root, "Target.md"), "The target note", "utf-8");
    fs.writeFileSync(path.join(root, "A.md"), "Links to [[Target]]", "utf-8");
    fs.writeFileSync(path.join(root, "B.md"), "No links here", "utf-8");
    writeNotesFoldersFile(notesFoldersFile, [{ name: "Work", root }]);

    const result = await runCliCommand(["get_backlinks", "--folder", "Work", "Target.md"], notesFoldersFile, accessFile());

    expect(result.ok).toBe(true);
    expect(result.backlinks).toEqual(["A.md"]);
  });

  it("resolves link targets case-insensitively", async () => {
    const notesFoldersFile = path.join(tmpDir(), "notesFolders.json");
    const root = tmpDir();
    fs.mkdirSync(root, { recursive: true });
    fs.writeFileSync(path.join(root, "Target.md"), "The target note", "utf-8");
    fs.writeFileSync(path.join(root, "A.md"), "Links to [[target]]", "utf-8");
    writeNotesFoldersFile(notesFoldersFile, [{ name: "Work", root }]);

    const result = await runCliCommand(["get_backlinks", "--folder", "Work", "Target.md"], notesFoldersFile, accessFile());

    expect(result.backlinks).toEqual(["A.md"]);
  });

  it("does not include notes that only share a tag", async () => {
    const notesFoldersFile = path.join(tmpDir(), "notesFolders.json");
    const root = tmpDir();
    fs.mkdirSync(root, { recursive: true });
    fs.writeFileSync(path.join(root, "Target.md"), "#project", "utf-8");
    fs.writeFileSync(path.join(root, "A.md"), "#project", "utf-8");
    writeNotesFoldersFile(notesFoldersFile, [{ name: "Work", root }]);

    const result = await runCliCommand(["get_backlinks", "--folder", "Work", "Target.md"], notesFoldersFile, accessFile());

    expect(result.backlinks).toEqual([]);
  });

  it("returns an empty list when nothing links to the note", async () => {
    const notesFoldersFile = path.join(tmpDir(), "notesFolders.json");
    const root = tmpDir();
    fs.mkdirSync(root, { recursive: true });
    fs.writeFileSync(path.join(root, "A.md"), "Nothing links here", "utf-8");
    writeNotesFoldersFile(notesFoldersFile, [{ name: "Work", root }]);

    const result = await runCliCommand(["get_backlinks", "--folder", "Work", "A.md"], notesFoldersFile, accessFile());

    expect(result.backlinks).toEqual([]);
  });

  it("reports when the note does not exist instead of throwing", async () => {
    const notesFoldersFile = path.join(tmpDir(), "notesFolders.json");
    const root = tmpDir();
    fs.mkdirSync(root, { recursive: true });
    writeNotesFoldersFile(notesFoldersFile, [{ name: "Work", root }]);

    const result = await runCliCommand(["get_backlinks", "--folder", "Work", "Missing.md"], notesFoldersFile, accessFile());

    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/does not exist/);
  });

  it("throws when the notes folder name is unknown", async () => {
    const notesFoldersFile = path.join(tmpDir(), "notesFolders.json");
    await expect(runCliCommand(["get_backlinks", "--folder", "Missing", "A.md"], notesFoldersFile, accessFile())).rejects.toThrow(
      /No notes folder named/
    );
  });
});

describe("runCliCommand: get_tags", () => {
  it("groups notes by tag, from frontmatter and inline #tags", async () => {
    const notesFoldersFile = path.join(tmpDir(), "notesFolders.json");
    const root = tmpDir();
    fs.mkdirSync(root, { recursive: true });
    fs.writeFileSync(path.join(root, "A.md"), "---\ntags: [project]\n---\nBody", "utf-8");
    fs.writeFileSync(path.join(root, "B.md"), "Some text #project", "utf-8");
    fs.writeFileSync(path.join(root, "C.md"), "#other", "utf-8");
    writeNotesFoldersFile(notesFoldersFile, [{ name: "Work", root }]);

    const result = await runCliCommand(["get_tags", "--folder", "Work"], notesFoldersFile, accessFile());

    expect(result.ok).toBe(true);
    expect(result.tags).toEqual([
      { tag: "other", notes: ["C.md"] },
      { tag: "project", notes: ["A.md", "B.md"] },
    ]);
  });

  it("returns an empty list when no notes have tags", async () => {
    const notesFoldersFile = path.join(tmpDir(), "notesFolders.json");
    const root = tmpDir();
    fs.mkdirSync(root, { recursive: true });
    fs.writeFileSync(path.join(root, "A.md"), "no tags here", "utf-8");
    writeNotesFoldersFile(notesFoldersFile, [{ name: "Work", root }]);

    const result = await runCliCommand(["get_tags", "--folder", "Work"], notesFoldersFile, accessFile());

    expect(result.tags).toEqual([]);
  });

  it("throws when the notes folder name is unknown", async () => {
    const notesFoldersFile = path.join(tmpDir(), "notesFolders.json");
    await expect(runCliCommand(["get_tags", "--folder", "Missing"], notesFoldersFile, accessFile())).rejects.toThrow(
      /No notes folder named/
    );
  });
});

describe("runCliCommand: --if-unmodified-since (optimistic concurrency)", () => {
  it("update_note rejects a stale mtime without modifying the note", async () => {
    const notesFoldersFile = path.join(tmpDir(), "notesFolders.json");
    const root = tmpDir();
    fs.mkdirSync(root, { recursive: true });
    fs.writeFileSync(path.join(root, "A.md"), "original", "utf-8");
    writeNotesFoldersFile(notesFoldersFile, [{ name: "Work", root }]);
    const staleMtime = fs.statSync(path.join(root, "A.md")).mtimeMs - 1000;

    const result = await runCliCommand(
      ["update_note", "--folder", "Work", "A.md", "--content", "appended", "--if-unmodified-since", String(staleMtime)],
      notesFoldersFile,
      accessFile()
    );

    expect(result.ok).toBe(false);
    expect(result.conflict).toBe(true);
    expect(fs.readFileSync(path.join(root, "A.md"), "utf-8")).toBe("original");
  });

  it("update_note succeeds when the given mtime matches", async () => {
    const notesFoldersFile = path.join(tmpDir(), "notesFolders.json");
    const root = tmpDir();
    fs.mkdirSync(root, { recursive: true });
    fs.writeFileSync(path.join(root, "A.md"), "original", "utf-8");
    writeNotesFoldersFile(notesFoldersFile, [{ name: "Work", root }]);
    const currentMtime = fs.statSync(path.join(root, "A.md")).mtimeMs;

    const result = await runCliCommand(
      ["update_note", "--folder", "Work", "A.md", "--content", "appended", "--if-unmodified-since", String(currentMtime)],
      notesFoldersFile,
      accessFile()
    );

    expect(result.ok).toBe(true);
    expect(result.content).toBe("original\nappended");
  });

  it("set_note rejects a stale mtime when overwriting an existing note", async () => {
    const notesFoldersFile = path.join(tmpDir(), "notesFolders.json");
    const root = tmpDir();
    fs.mkdirSync(root, { recursive: true });
    fs.writeFileSync(path.join(root, "A.md"), "original", "utf-8");
    writeNotesFoldersFile(notesFoldersFile, [{ name: "Work", root }]);
    const staleMtime = fs.statSync(path.join(root, "A.md")).mtimeMs - 1000;

    const result = await runCliCommand(
      ["set_note", "--folder", "Work", "A.md", "--content", "new", "--if-unmodified-since", String(staleMtime)],
      notesFoldersFile,
      accessFile()
    );

    expect(result.ok).toBe(false);
    expect(result.conflict).toBe(true);
    expect(fs.readFileSync(path.join(root, "A.md"), "utf-8")).toBe("original");
  });

  it("set_note ignores --if-unmodified-since when the note doesn't exist yet", async () => {
    const notesFoldersFile = path.join(tmpDir(), "notesFolders.json");
    const root = tmpDir();
    fs.mkdirSync(root, { recursive: true });
    writeNotesFoldersFile(notesFoldersFile, [{ name: "Work", root }]);

    const result = await runCliCommand(
      ["set_note", "--folder", "Work", "New.md", "--content", "hi", "--if-unmodified-since", "0"],
      notesFoldersFile,
      accessFile()
    );

    expect(result.ok).toBe(true);
    expect(result.created).toBe(true);
  });

  it("delete_note rejects a stale mtime without deleting the note", async () => {
    const notesFoldersFile = path.join(tmpDir(), "notesFolders.json");
    const root = tmpDir();
    fs.mkdirSync(root, { recursive: true });
    fs.writeFileSync(path.join(root, "A.md"), "content", "utf-8");
    writeNotesFoldersFile(notesFoldersFile, [{ name: "Work", root }]);
    const staleMtime = fs.statSync(path.join(root, "A.md")).mtimeMs - 1000;

    const result = await runCliCommand(
      ["delete_note", "--folder", "Work", "A.md", "--if-unmodified-since", String(staleMtime)],
      notesFoldersFile,
      accessFile()
    );

    expect(result.ok).toBe(false);
    expect(result.conflict).toBe(true);
    expect(fs.existsSync(path.join(root, "A.md"))).toBe(true);
  });

  it("set_properties rejects a stale mtime without modifying properties", async () => {
    const notesFoldersFile = path.join(tmpDir(), "notesFolders.json");
    const root = tmpDir();
    fs.mkdirSync(root, { recursive: true });
    fs.writeFileSync(path.join(root, "A.md"), "---\nstatus: active\n---\nBody", "utf-8");
    writeNotesFoldersFile(notesFoldersFile, [{ name: "Work", root }]);
    const staleMtime = fs.statSync(path.join(root, "A.md")).mtimeMs - 1000;

    const result = await runCliCommand(
      ["set_properties", "--folder", "Work", "A.md", "--json", '{"status":"done"}', "--if-unmodified-since", String(staleMtime)],
      notesFoldersFile,
      accessFile()
    );

    expect(result.ok).toBe(false);
    expect(result.conflict).toBe(true);
    expect(fs.readFileSync(path.join(root, "A.md"), "utf-8")).toContain("status: active");
  });

  it("rejects a non-numeric --if-unmodified-since", async () => {
    const notesFoldersFile = path.join(tmpDir(), "notesFolders.json");
    const root = tmpDir();
    fs.mkdirSync(root, { recursive: true });
    fs.writeFileSync(path.join(root, "A.md"), "content", "utf-8");
    writeNotesFoldersFile(notesFoldersFile, [{ name: "Work", root }]);

    await expect(
      runCliCommand(
        ["update_note", "--folder", "Work", "A.md", "--content", "x", "--if-unmodified-since", "not-a-number"],
        notesFoldersFile,
        accessFile()
      )
    ).rejects.toThrow(/must be a number/);
  });
});

describe("runCliCommand: note history", () => {
  it("does not record any history when historyRoot is omitted (backward compatible)", async () => {
    const notesFoldersFile = path.join(tmpDir(), "notesFolders.json");
    const root = tmpDir();
    fs.mkdirSync(root, { recursive: true });
    fs.writeFileSync(path.join(root, "A.md"), "original", "utf-8");
    writeNotesFoldersFile(notesFoldersFile, [{ name: "Work", root }]);

    await runCliCommand(["set_note", "--folder", "Work", "A.md", "--content", "new"], notesFoldersFile, accessFile());

    expect(fs.readFileSync(path.join(root, "A.md"), "utf-8")).toBe("new");
  });

  it("set_note snapshots the previous content before overwriting", async () => {
    const notesFoldersFile = path.join(tmpDir(), "notesFolders.json");
    const root = tmpDir();
    const historyRoot = tmpDir();
    fs.mkdirSync(root, { recursive: true });
    fs.writeFileSync(path.join(root, "A.md"), "original", "utf-8");
    writeNotesFoldersFile(notesFoldersFile, [{ name: "Work", root }]);

    await runCliCommand(
      ["set_note", "--folder", "Work", "A.md", "--content", "new"],
      notesFoldersFile,
      accessFile(),
      historyRoot
    );

    const history = await runCliCommand(["get_note_history", "--folder", "Work", "A.md"], notesFoldersFile, accessFile(), historyRoot);
    expect(history.versions).toHaveLength(1);
    const [{ timestamp }] = history.versions as { timestamp: string }[];
    expect(readSnapshot(historyRoot, root, "A.md", timestamp)).toBe("original");
  });

  it("set_note does not snapshot when creating a brand-new note", async () => {
    const notesFoldersFile = path.join(tmpDir(), "notesFolders.json");
    const root = tmpDir();
    const historyRoot = tmpDir();
    fs.mkdirSync(root, { recursive: true });
    writeNotesFoldersFile(notesFoldersFile, [{ name: "Work", root }]);

    await runCliCommand(
      ["set_note", "--folder", "Work", "A.md", "--content", "new"],
      notesFoldersFile,
      accessFile(),
      historyRoot
    );

    const history = await runCliCommand(["get_note_history", "--folder", "Work", "A.md"], notesFoldersFile, accessFile(), historyRoot);
    expect(history.versions).toHaveLength(0);
  });

  it("update_note snapshots the pre-append content", async () => {
    const notesFoldersFile = path.join(tmpDir(), "notesFolders.json");
    const root = tmpDir();
    const historyRoot = tmpDir();
    fs.mkdirSync(root, { recursive: true });
    fs.writeFileSync(path.join(root, "A.md"), "original", "utf-8");
    writeNotesFoldersFile(notesFoldersFile, [{ name: "Work", root }]);

    await runCliCommand(
      ["update_note", "--folder", "Work", "A.md", "--content", "appended"],
      notesFoldersFile,
      accessFile(),
      historyRoot
    );

    const history = await runCliCommand(["get_note_history", "--folder", "Work", "A.md"], notesFoldersFile, accessFile(), historyRoot);
    expect(history.versions).toHaveLength(1);
    const [{ timestamp }] = history.versions as { timestamp: string }[];
    expect(readSnapshot(historyRoot, root, "A.md", timestamp)).toBe("original");
  });

  it("delete_note snapshots the deleted content", async () => {
    const notesFoldersFile = path.join(tmpDir(), "notesFolders.json");
    const root = tmpDir();
    const historyRoot = tmpDir();
    fs.mkdirSync(root, { recursive: true });
    fs.writeFileSync(path.join(root, "A.md"), "gone soon", "utf-8");
    writeNotesFoldersFile(notesFoldersFile, [{ name: "Work", root }]);

    await runCliCommand(["delete_note", "--folder", "Work", "A.md"], notesFoldersFile, accessFile(), historyRoot);

    const history = await runCliCommand(["get_note_history", "--folder", "Work", "A.md"], notesFoldersFile, accessFile(), historyRoot);
    expect(history.versions).toHaveLength(1);
    const [{ timestamp }] = history.versions as { timestamp: string }[];
    expect(readSnapshot(historyRoot, root, "A.md", timestamp)).toBe("gone soon");
  });

  it("get_note_history throws when historyRoot is not configured", async () => {
    const notesFoldersFile = path.join(tmpDir(), "notesFolders.json");
    const root = tmpDir();
    fs.mkdirSync(root, { recursive: true });
    writeNotesFoldersFile(notesFoldersFile, [{ name: "Work", root }]);

    await expect(
      runCliCommand(["get_note_history", "--folder", "Work", "A.md"], notesFoldersFile, accessFile())
    ).rejects.toThrow(/History is not available/);
  });

  it("restore_note_version overwrites the note and snapshots the pre-restore content", async () => {
    const notesFoldersFile = path.join(tmpDir(), "notesFolders.json");
    const root = tmpDir();
    const historyRoot = tmpDir();
    fs.mkdirSync(root, { recursive: true });
    fs.writeFileSync(path.join(root, "A.md"), "version A", "utf-8");
    writeNotesFoldersFile(notesFoldersFile, [{ name: "Work", root }]);

    // Snapshots "version A", writes "version B".
    await runCliCommand(
      ["set_note", "--folder", "Work", "A.md", "--content", "version B"],
      notesFoldersFile,
      accessFile(),
      historyRoot
    );
    const historyBefore = await runCliCommand(
      ["get_note_history", "--folder", "Work", "A.md"],
      notesFoldersFile,
      accessFile(),
      historyRoot
    );
    const [{ timestamp: versionATimestamp }] = historyBefore.versions as { timestamp: string }[];

    const result = await runCliCommand(
      ["restore_note_version", "--folder", "Work", "A.md", "--timestamp", versionATimestamp],
      notesFoldersFile,
      accessFile(),
      historyRoot
    );

    expect(result.ok).toBe(true);
    expect(fs.readFileSync(path.join(root, "A.md"), "utf-8")).toBe("version A");

    // Restoring itself is undoable: "version B" was snapshotted before being overwritten.
    const historyAfter = await runCliCommand(
      ["get_note_history", "--folder", "Work", "A.md"],
      notesFoldersFile,
      accessFile(),
      historyRoot
    );
    expect(historyAfter.versions).toHaveLength(2);
  });

  it("restore_note_version fails when no snapshot matches the given timestamp", async () => {
    const notesFoldersFile = path.join(tmpDir(), "notesFolders.json");
    const root = tmpDir();
    const historyRoot = tmpDir();
    fs.mkdirSync(root, { recursive: true });
    fs.writeFileSync(path.join(root, "A.md"), "content", "utf-8");
    writeNotesFoldersFile(notesFoldersFile, [{ name: "Work", root }]);

    const result = await runCliCommand(
      ["restore_note_version", "--folder", "Work", "A.md", "--timestamp", "2020-01-01T00:00:00.000Z"],
      notesFoldersFile,
      accessFile(),
      historyRoot
    );

    expect(result.ok).toBe(false);
  });

  it("restore_note_version rejects a stale --if-unmodified-since", async () => {
    const notesFoldersFile = path.join(tmpDir(), "notesFolders.json");
    const root = tmpDir();
    const historyRoot = tmpDir();
    fs.mkdirSync(root, { recursive: true });
    fs.writeFileSync(path.join(root, "A.md"), "version A", "utf-8");
    writeNotesFoldersFile(notesFoldersFile, [{ name: "Work", root }]);

    await runCliCommand(
      ["set_note", "--folder", "Work", "A.md", "--content", "version B"],
      notesFoldersFile,
      accessFile(),
      historyRoot
    );
    const history = await runCliCommand(
      ["get_note_history", "--folder", "Work", "A.md"],
      notesFoldersFile,
      accessFile(),
      historyRoot
    );
    const [{ timestamp }] = history.versions as { timestamp: string }[];
    const staleMtime = fs.statSync(path.join(root, "A.md")).mtimeMs - 1000;

    const result = await runCliCommand(
      ["restore_note_version", "--folder", "Work", "A.md", "--timestamp", timestamp, "--if-unmodified-since", String(staleMtime)],
      notesFoldersFile,
      accessFile(),
      historyRoot
    );

    expect(result.ok).toBe(false);
    expect(result.conflict).toBe(true);
    expect(fs.readFileSync(path.join(root, "A.md"), "utf-8")).toBe("version B");
  });
});

describe("runCliCommand: --content-file - (stdin)", () => {
  it("add_note reads content from the injected stdin reader", async () => {
    const notesFoldersFile = path.join(tmpDir(), "notesFolders.json");
    const root = tmpDir();
    fs.mkdirSync(root, { recursive: true });
    writeNotesFoldersFile(notesFoldersFile, [{ name: "Work", root }]);

    const result = await runCliCommand(
      ["add_note", "--folder", "Work", "Idea", "--content-file", "-"],
      notesFoldersFile,
      accessFile(),
      undefined,
      () => "piped content"
    );

    expect(result.ok).toBe(true);
    expect(fs.readFileSync(path.join(root, "Idea.md"), "utf-8")).toBe("piped content");
  });

  it("set_note reads content from stdin", async () => {
    const notesFoldersFile = path.join(tmpDir(), "notesFolders.json");
    const root = tmpDir();
    fs.mkdirSync(root, { recursive: true });
    writeNotesFoldersFile(notesFoldersFile, [{ name: "Work", root }]);

    await runCliCommand(
      ["set_note", "--folder", "Work", "Prefs.md", "--content-file", "-"],
      notesFoldersFile,
      accessFile(),
      undefined,
      () => "from stdin"
    );

    expect(fs.readFileSync(path.join(root, "Prefs.md"), "utf-8")).toBe("from stdin");
  });

  it("update_note reads the appended text from stdin", async () => {
    const notesFoldersFile = path.join(tmpDir(), "notesFolders.json");
    const root = tmpDir();
    fs.mkdirSync(root, { recursive: true });
    fs.writeFileSync(path.join(root, "A.md"), "original", "utf-8");
    writeNotesFoldersFile(notesFoldersFile, [{ name: "Work", root }]);

    await runCliCommand(
      ["update_note", "--folder", "Work", "A.md", "--content-file", "-"],
      notesFoldersFile,
      accessFile(),
      undefined,
      () => "appended via stdin"
    );

    expect(fs.readFileSync(path.join(root, "A.md"), "utf-8")).toBe("original\nappended via stdin");
  });

  it("falls back to the real stdin reader when none is injected (doesn't throw at call time)", async () => {
    // Not exercising an actual read here (that would block on the test
    // runner's own stdin) - just confirming the default parameter wiring
    // doesn't error out before reaching resolveContentFlag when --content is
    // used instead, i.e. omitting readStdin entirely is a valid call shape.
    const notesFoldersFile = path.join(tmpDir(), "notesFolders.json");
    const root = tmpDir();
    fs.mkdirSync(root, { recursive: true });
    writeNotesFoldersFile(notesFoldersFile, [{ name: "Work", root }]);

    const result = await runCliCommand(
      ["set_note", "--folder", "Work", "Prefs.md", "--content", "hello"],
      notesFoldersFile,
      accessFile()
    );

    expect(result.ok).toBe(true);
  });
});

describe("runCliCommand: get_orphaned_attachments / delete_orphaned_attachments", () => {
  it("lists an attachment no note references", async () => {
    const notesFoldersFile = path.join(tmpDir(), "notesFolders.json");
    const root = tmpDir();
    fs.mkdirSync(path.join(root, "attachments"), { recursive: true });
    fs.writeFileSync(path.join(root, "attachments", "foo.png"), "x", "utf-8");
    fs.writeFileSync(path.join(root, "Note.md"), "no images here", "utf-8");
    writeNotesFoldersFile(notesFoldersFile, [{ name: "Work", root }]);

    const result = await runCliCommand(["get_orphaned_attachments", "--folder", "Work"], notesFoldersFile, accessFile());

    expect(result.ok).toBe(true);
    expect(result.orphaned).toEqual(["attachments/foo.png"]);
  });

  it("does not list an attachment a note references", async () => {
    const notesFoldersFile = path.join(tmpDir(), "notesFolders.json");
    const root = tmpDir();
    fs.mkdirSync(path.join(root, "attachments"), { recursive: true });
    fs.writeFileSync(path.join(root, "attachments", "foo.png"), "x", "utf-8");
    fs.writeFileSync(path.join(root, "Note.md"), "![alt](attachments/foo.png)", "utf-8");
    writeNotesFoldersFile(notesFoldersFile, [{ name: "Work", root }]);

    const result = await runCliCommand(["get_orphaned_attachments", "--folder", "Work"], notesFoldersFile, accessFile());

    expect(result.orphaned).toEqual([]);
  });

  it("delete_orphaned_attachments removes only the unreferenced files and reports them", async () => {
    const notesFoldersFile = path.join(tmpDir(), "notesFolders.json");
    const root = tmpDir();
    fs.mkdirSync(path.join(root, "attachments"), { recursive: true });
    fs.writeFileSync(path.join(root, "attachments", "used.png"), "x", "utf-8");
    fs.writeFileSync(path.join(root, "attachments", "unused.png"), "x", "utf-8");
    fs.writeFileSync(path.join(root, "Note.md"), "![alt](attachments/used.png)", "utf-8");
    writeNotesFoldersFile(notesFoldersFile, [{ name: "Work", root }]);

    const result = await runCliCommand(["delete_orphaned_attachments", "--folder", "Work"], notesFoldersFile, accessFile());

    expect(result.ok).toBe(true);
    expect(result.deleted).toEqual(["attachments/unused.png"]);
    expect(fs.existsSync(path.join(root, "attachments", "unused.png"))).toBe(false);
    expect(fs.existsSync(path.join(root, "attachments", "used.png"))).toBe(true);
  });

  it("denies access to an ungranted folder", async () => {
    const notesFoldersFile = path.join(tmpDir(), "notesFolders.json");
    const root = tmpDir();
    fs.mkdirSync(root, { recursive: true });
    writeNotesFoldersFile(notesFoldersFile, [{ name: "Work", root }]);
    const noAccessDir = tmpDir();
    fs.mkdirSync(noAccessDir, { recursive: true });
    const noAccessFile = path.join(noAccessDir, "cli-access.json");
    fs.writeFileSync(noAccessFile, JSON.stringify({ allowed: [] }), "utf-8");

    await expect(
      runCliCommand(["get_orphaned_attachments", "--folder", "Work"], notesFoldersFile, noAccessFile)
    ).rejects.toThrow(/has not been granted/);
  });
});
