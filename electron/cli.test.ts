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
