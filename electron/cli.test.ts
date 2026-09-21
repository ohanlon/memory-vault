import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { extractCliArgs, runCliCommand } from "./cli";
import { writeNotesFoldersFile } from "./notesFolderRegistry";

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "cairn-cli-test-"));
let counter = 0;
function tmpDir(): string {
  counter += 1;
  return path.join(tmpRoot, `case-${counter}`);
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

    const result = await runCliCommand(["add_folder", folderPath], notesFoldersFile);

    expect(result.ok).toBe(true);
    expect(result.alreadyExists).toBe(false);
    expect(result.name).toBe("Work");
    expect(fs.existsSync(folderPath)).toBe(true);
  });

  it("uses a provided --name instead of the folder's basename", async () => {
    const notesFoldersFile = path.join(tmpDir(), "notesFolders.json");
    const folderPath = path.join(tmpDir(), "some-dir");

    const result = await runCliCommand(["add_folder", folderPath, "--name", "My Notes"], notesFoldersFile);

    expect(result.name).toBe("My Notes");
  });

  it("reports the folder is already registered when the same root is added twice", async () => {
    const notesFoldersFile = path.join(tmpDir(), "notesFolders.json");
    const folderPath = path.join(tmpDir(), "Work");

    await runCliCommand(["add_folder", folderPath], notesFoldersFile);
    const second = await runCliCommand(["add_folder", folderPath], notesFoldersFile);

    expect(second.alreadyExists).toBe(true);
    expect(second.name).toBe("Work");
  });

  it("avoids a name collision by picking a new name and reporting it", async () => {
    const notesFoldersFile = path.join(tmpDir(), "notesFolders.json");
    const dir = tmpDir();

    await runCliCommand(["add_folder", path.join(dir, "a")], notesFoldersFile);
    const result = await runCliCommand(["add_folder", path.join(dir, "b"), "--name", "a"], notesFoldersFile);

    expect(result.name).toBe("a 2");
    expect(result.renamed).toBe(true);
  });
});

describe("runCliCommand: list_folders", () => {
  it("lists registered notes folders", async () => {
    const notesFoldersFile = path.join(tmpDir(), "notesFolders.json");
    writeNotesFoldersFile(notesFoldersFile, [{ name: "Work", root: "/notes/work" }]);

    const result = await runCliCommand(["list_folders"], notesFoldersFile);

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

    const result = await runCliCommand(["get_notes", "--folder", "Work"], notesFoldersFile);

    expect(result.notes).toEqual(["A.md"]);
  });

  it("includes notes from subfolders with --subfolders", async () => {
    const notesFoldersFile = path.join(tmpDir(), "notesFolders.json");
    const root = tmpDir();
    fs.mkdirSync(path.join(root, "Sub"), { recursive: true });
    fs.writeFileSync(path.join(root, "A.md"), "a", "utf-8");
    fs.writeFileSync(path.join(root, "Sub", "B.md"), "b", "utf-8");
    writeNotesFoldersFile(notesFoldersFile, [{ name: "Work", root }]);

    const result = await runCliCommand(["get_notes", "--folder", "Work", "--subfolders"], notesFoldersFile);

    expect((result.notes as string[]).sort()).toEqual(["A.md", path.join("Sub", "B.md")].sort());
  });

  it("throws when the notes folder name is unknown", async () => {
    const notesFoldersFile = path.join(tmpDir(), "notesFolders.json");
    await expect(runCliCommand(["get_notes", "--folder", "Missing"], notesFoldersFile)).rejects.toThrow(
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

    const result = await runCliCommand(["get_note", "--folder", "Work", "A.md"], notesFoldersFile);

    expect(result.ok).toBe(true);
    expect(result.content).toBe("hello");
  });

  it("reports when the note does not exist instead of throwing", async () => {
    const notesFoldersFile = path.join(tmpDir(), "notesFolders.json");
    const root = tmpDir();
    fs.mkdirSync(root, { recursive: true });
    writeNotesFoldersFile(notesFoldersFile, [{ name: "Work", root }]);

    const result = await runCliCommand(["get_note", "--folder", "Work", "Missing.md"], notesFoldersFile);

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
      notesFoldersFile
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
      notesFoldersFile
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

    const result = await runCliCommand(["add_note", "--folder", "Work", "My Note"], notesFoldersFile);

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
      notesFoldersFile
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
        notesFoldersFile
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
        notesFoldersFile
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
      notesFoldersFile
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
      notesFoldersFile
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
      notesFoldersFile
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
      notesFoldersFile
    );

    expect(result.content).toBe("line one\nline two\nline three");
  });

  it("requires either --content or --content-file", async () => {
    const notesFoldersFile = path.join(tmpDir(), "notesFolders.json");
    const root = tmpDir();
    fs.mkdirSync(root, { recursive: true });
    fs.writeFileSync(path.join(root, "A.md"), "line one", "utf-8");
    writeNotesFoldersFile(notesFoldersFile, [{ name: "Work", root }]);

    await expect(runCliCommand(["update_note", "--folder", "Work", "A.md"], notesFoldersFile)).rejects.toThrow(
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
      notesFoldersFile
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
      notesFoldersFile
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
      notesFoldersFile
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
      notesFoldersFile
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
      notesFoldersFile
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
      notesFoldersFile
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
      notesFoldersFile
    );

    expect(fs.existsSync(path.join(root, "Nested", "Prefs.md"))).toBe(true);
  });

  it("refuses to write outside the notes folder", async () => {
    const notesFoldersFile = path.join(tmpDir(), "notesFolders.json");
    const root = tmpDir();
    fs.mkdirSync(root, { recursive: true });
    writeNotesFoldersFile(notesFoldersFile, [{ name: "Work", root }]);

    await expect(
      runCliCommand(["set_note", "--folder", "Work", "../outside.md", "--content", "x"], notesFoldersFile)
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

    const result = await runCliCommand(["search_notes", "--folder", "Work", "dark mode"], notesFoldersFile);

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

    const result = await runCliCommand(["search_notes", "--folder", "Work", "target"], notesFoldersFile);

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
      notesFoldersFile
    );

    expect((result.results as { matches: unknown[] }[])[0].matches).toHaveLength(1);
  });

  it("returns an empty results list when nothing matches", async () => {
    const notesFoldersFile = path.join(tmpDir(), "notesFolders.json");
    const root = tmpDir();
    fs.mkdirSync(root, { recursive: true });
    fs.writeFileSync(path.join(root, "A.md"), "nothing relevant", "utf-8");
    writeNotesFoldersFile(notesFoldersFile, [{ name: "Work", root }]);

    const result = await runCliCommand(["search_notes", "--folder", "Work", "missing"], notesFoldersFile);

    expect(result.results).toEqual([]);
  });

  it("throws when the notes folder name is unknown", async () => {
    const notesFoldersFile = path.join(tmpDir(), "notesFolders.json");
    await expect(runCliCommand(["search_notes", "--folder", "Missing", "text"], notesFoldersFile)).rejects.toThrow(
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

    const result = await runCliCommand(["delete_note", "--folder", "Work", "A.md"], notesFoldersFile);

    expect(result.ok).toBe(true);
    expect(fs.existsSync(path.join(root, "A.md"))).toBe(false);
  });

  it("reports when the note does not exist instead of throwing", async () => {
    const notesFoldersFile = path.join(tmpDir(), "notesFolders.json");
    const root = tmpDir();
    fs.mkdirSync(root, { recursive: true });
    writeNotesFoldersFile(notesFoldersFile, [{ name: "Work", root }]);

    const result = await runCliCommand(["delete_note", "--folder", "Work", "Missing.md"], notesFoldersFile);

    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/does not exist/);
  });

  it("throws when the notes folder name is unknown", async () => {
    const notesFoldersFile = path.join(tmpDir(), "notesFolders.json");
    await expect(runCliCommand(["delete_note", "--folder", "Missing", "A.md"], notesFoldersFile)).rejects.toThrow(
      /No notes folder named/
    );
  });

  it("refuses to delete a path outside the notes folder", async () => {
    const notesFoldersFile = path.join(tmpDir(), "notesFolders.json");
    const root = tmpDir();
    fs.mkdirSync(root, { recursive: true });
    writeNotesFoldersFile(notesFoldersFile, [{ name: "Work", root }]);

    await expect(
      runCliCommand(["delete_note", "--folder", "Work", "../outside.md"], notesFoldersFile)
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

    const result = await runCliCommand(["get_properties", "--folder", "Work", "A.md"], notesFoldersFile);

    expect(result.ok).toBe(true);
    expect(result.properties).toEqual({ status: "active", priority: 2 });
  });

  it("returns an empty object for a note with no frontmatter", async () => {
    const notesFoldersFile = path.join(tmpDir(), "notesFolders.json");
    const root = tmpDir();
    fs.mkdirSync(root, { recursive: true });
    fs.writeFileSync(path.join(root, "A.md"), "just body text", "utf-8");
    writeNotesFoldersFile(notesFoldersFile, [{ name: "Work", root }]);

    const result = await runCliCommand(["get_properties", "--folder", "Work", "A.md"], notesFoldersFile);

    expect(result.properties).toEqual({});
  });

  it("reports when the note does not exist instead of throwing", async () => {
    const notesFoldersFile = path.join(tmpDir(), "notesFolders.json");
    const root = tmpDir();
    fs.mkdirSync(root, { recursive: true });
    writeNotesFoldersFile(notesFoldersFile, [{ name: "Work", root }]);

    const result = await runCliCommand(["get_properties", "--folder", "Work", "Missing.md"], notesFoldersFile);

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
      notesFoldersFile
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
      notesFoldersFile
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
      notesFoldersFile
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
      notesFoldersFile
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
      notesFoldersFile
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
      runCliCommand(["set_properties", "--folder", "Work", "A.md", "--json", "{not valid"], notesFoldersFile)
    ).rejects.toThrow(/must be valid JSON/);
  });

  it("rejects a JSON value that isn't an object", async () => {
    const notesFoldersFile = path.join(tmpDir(), "notesFolders.json");
    const root = tmpDir();
    fs.mkdirSync(root, { recursive: true });
    fs.writeFileSync(path.join(root, "A.md"), "Body", "utf-8");
    writeNotesFoldersFile(notesFoldersFile, [{ name: "Work", root }]);

    await expect(
      runCliCommand(["set_properties", "--folder", "Work", "A.md", "--json", "[1,2,3]"], notesFoldersFile)
    ).rejects.toThrow(/must be a JSON object/);
  });
});
