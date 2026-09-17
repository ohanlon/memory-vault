import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { addNotesFolder, findByNameCI, readNotesFoldersFile, removeNotesFolder, renameNotesFolder, writeNotesFoldersFile } from "./notesFolderRegistry";
import { NOTES_FOLDER_AVATAR_COUNT, defaultAvatarIndexForName } from "../shared/avatars";
import type { NotesFolderEntry } from "../shared/types";

describe("addNotesFolder", () => {
  it("adds a notes folder to an empty list", () => {
    const result = addNotesFolder([], "Work", "/notes/work");
    expect(result).toEqual([
      { name: "Work", root: "/notes/work", avatar: { kind: "builtin", index: defaultAvatarIndexForName("Work", NOTES_FOLDER_AVATAR_COUNT) } },
    ]);
  });

  it("assigns a deterministic built-in avatar index", () => {
    const result = addNotesFolder([], "Personal", "/notes/personal");
    expect(result[0].avatar).toEqual({ kind: "builtin", index: defaultAvatarIndexForName("Personal", NOTES_FOLDER_AVATAR_COUNT) });
  });

  it("trims whitespace from the name", () => {
    const result = addNotesFolder([], "  Work  ", "/notes/work");
    expect(result[0].name).toBe("Work");
  });

  it("rejects an empty name", () => {
    expect(() => addNotesFolder([], "   ", "/notes/work")).toThrow();
  });

  it("rejects a duplicate name with different casing", () => {
    const existing: NotesFolderEntry[] = [{ name: "Work", root: "/notes/work" }];
    expect(() => addNotesFolder(existing, "work", "/notes/other")).toThrow(/already exists/);
    expect(() => addNotesFolder(existing, "WORK", "/notes/other")).toThrow(/already exists/);
  });

  it("allows two different names pointing at different folders", () => {
    const existing: NotesFolderEntry[] = [{ name: "Work", root: "/notes/work" }];
    const result = addNotesFolder(existing, "Personal", "/notes/personal");
    expect(result).toHaveLength(2);
  });

  it("does not mutate the input array", () => {
    const existing: NotesFolderEntry[] = [{ name: "Work", root: "/notes/work" }];
    addNotesFolder(existing, "Personal", "/notes/personal");
    expect(existing).toHaveLength(1);
  });
});

describe("findByNameCI", () => {
  it("finds a notes folder regardless of case", () => {
    const notesFolders: NotesFolderEntry[] = [{ name: "Work", root: "/notes/work" }];
    expect(findByNameCI(notesFolders, "work")).toEqual({ name: "Work", root: "/notes/work" });
    expect(findByNameCI(notesFolders, "WORK")).toEqual({ name: "Work", root: "/notes/work" });
  });

  it("returns undefined when no notes folder matches", () => {
    expect(findByNameCI([], "anything")).toBeUndefined();
  });
});

describe("removeNotesFolder", () => {
  it("removes a notes folder by name case-insensitively", () => {
    const notesFolders: NotesFolderEntry[] = [
      { name: "Work", root: "/notes/work" },
      { name: "Personal", root: "/notes/personal" },
    ];
    expect(removeNotesFolder(notesFolders, "WORK")).toEqual([{ name: "Personal", root: "/notes/personal" }]);
  });

  it("is a no-op when the name is not present", () => {
    const notesFolders: NotesFolderEntry[] = [{ name: "Work", root: "/notes/work" }];
    expect(removeNotesFolder(notesFolders, "Missing")).toEqual(notesFolders);
  });
});

describe("renameNotesFolder", () => {
  it("renames a notes folder by name case-insensitively", () => {
    const notesFolders: NotesFolderEntry[] = [
      { name: "Work", root: "/notes/work" },
      { name: "Personal", root: "/notes/personal" },
    ];
    expect(renameNotesFolder(notesFolders, "WORK", "Job")).toEqual([
      { name: "Job", root: "/notes/work" },
      { name: "Personal", root: "/notes/personal" },
    ]);
  });

  it("trims whitespace from the new name", () => {
    const notesFolders: NotesFolderEntry[] = [{ name: "Work", root: "/notes/work" }];
    expect(renameNotesFolder(notesFolders, "Work", "  Job  ")[0].name).toBe("Job");
  });

  it("rejects an empty new name", () => {
    const notesFolders: NotesFolderEntry[] = [{ name: "Work", root: "/notes/work" }];
    expect(() => renameNotesFolder(notesFolders, "Work", "   ")).toThrow();
  });

  it("rejects a new name that collides with a different notes folder", () => {
    const notesFolders: NotesFolderEntry[] = [
      { name: "Work", root: "/notes/work" },
      { name: "Personal", root: "/notes/personal" },
    ];
    expect(() => renameNotesFolder(notesFolders, "Work", "personal")).toThrow(/already exists/);
  });

  it("allows renaming to the same name (case change only)", () => {
    const notesFolders: NotesFolderEntry[] = [{ name: "Work", root: "/notes/work" }];
    expect(renameNotesFolder(notesFolders, "Work", "WORK")[0].name).toBe("WORK");
  });

  it("does not mutate the input array", () => {
    const notesFolders: NotesFolderEntry[] = [{ name: "Work", root: "/notes/work" }];
    renameNotesFolder(notesFolders, "Work", "Job");
    expect(notesFolders[0].name).toBe("Work");
  });
});

describe("readNotesFoldersFile / writeNotesFoldersFile", () => {
  const tmpFile = path.join(os.tmpdir(), `notes-folders-test-${process.pid}.json`);

  afterEach(() => {
    fs.rmSync(tmpFile, { force: true });
  });

  it("returns an empty array when the file does not exist", () => {
    expect(readNotesFoldersFile(tmpFile)).toEqual([]);
  });

  it("round-trips a list of notes folders through disk", () => {
    const notesFolders: NotesFolderEntry[] = [{ name: "Work", root: "/notes/work" }];
    writeNotesFoldersFile(tmpFile, notesFolders);
    expect(readNotesFoldersFile(tmpFile)).toEqual(notesFolders);
  });

  it("returns an empty array for corrupt JSON instead of throwing", () => {
    fs.writeFileSync(tmpFile, "{not valid json", "utf-8");
    expect(readNotesFoldersFile(tmpFile)).toEqual([]);
  });

  it("filters out malformed entries", () => {
    fs.writeFileSync(tmpFile, JSON.stringify([{ name: "Work" }, { root: "/x" }, { name: 1, root: 2 }]), "utf-8");
    expect(readNotesFoldersFile(tmpFile)).toEqual([]);
  });
});
