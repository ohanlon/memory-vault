import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { avatarDirPath, removeCustomAvatar, renameAvatarFolder, writeCustomAvatar } from "./avatarStorage";

const userDataDir = path.join(os.tmpdir(), `avatar-storage-test-${process.pid}`);
const sourceFiles: string[] = [];

afterEach(() => {
  fs.rmSync(userDataDir, { recursive: true, force: true });
  for (const sourcePath of sourceFiles.splice(0)) fs.rmSync(sourcePath, { force: true });
});

function writeSourceImage(fileName: string, content = "fake image bytes"): string {
  const sourcePath = path.join(os.tmpdir(), `avatar-source-${process.pid}-${fileName}`);
  fs.writeFileSync(sourcePath, content);
  sourceFiles.push(sourcePath);
  return sourcePath;
}

describe("writeCustomAvatar", () => {
  it("copies the source file into the entry's avatar folder", () => {
    const source = writeSourceImage("pic.png", "hello");
    const avatar = writeCustomAvatar(userDataDir, "stack", "Work", source);
    expect(avatar).toMatchObject({ kind: "custom", fileName: "avatar.png" });
    expect(typeof avatar.updatedAt).toBe("number");
    const written = fs.readFileSync(path.join(avatarDirPath(userDataDir, "stack", "Work"), "avatar.png"), "utf-8");
    expect(written).toBe("hello");
  });

  it("replaces a prior avatar even if the extension changed", () => {
    writeCustomAvatar(userDataDir, "stack", "Work", writeSourceImage("first.png", "old"));
    const avatar = writeCustomAvatar(userDataDir, "stack", "Work", writeSourceImage("second.jpg", "new"));
    expect(avatar.fileName).toBe("avatar.jpg");
    const dir = avatarDirPath(userDataDir, "stack", "Work");
    expect(fs.existsSync(path.join(dir, "avatar.png"))).toBe(false);
    expect(fs.readFileSync(path.join(dir, "avatar.jpg"), "utf-8")).toBe("new");
  });

  it("throws on an unsupported extension", () => {
    expect(() => writeCustomAvatar(userDataDir, "stack", "Work", writeSourceImage("notes.txt"))).toThrow(/Unsupported/);
  });
});

describe("removeCustomAvatar", () => {
  it("deletes the avatar folder", () => {
    writeCustomAvatar(userDataDir, "mergedView", "Life", writeSourceImage("pic.png"));
    removeCustomAvatar(userDataDir, "mergedView", "Life");
    expect(fs.existsSync(avatarDirPath(userDataDir, "mergedView", "Life"))).toBe(false);
  });

  it("is a no-op when no avatar folder exists", () => {
    expect(() => removeCustomAvatar(userDataDir, "stack", "Missing")).not.toThrow();
  });
});

describe("renameAvatarFolder", () => {
  it("moves the folder and its file to the new name", () => {
    writeCustomAvatar(userDataDir, "stack", "Work", writeSourceImage("pic.png", "content"));
    renameAvatarFolder(userDataDir, "stack", "Work", "Job");
    expect(fs.existsSync(avatarDirPath(userDataDir, "stack", "Work"))).toBe(false);
    expect(fs.readFileSync(path.join(avatarDirPath(userDataDir, "stack", "Job"), "avatar.png"), "utf-8")).toBe("content");
  });

  it("is a no-op when no avatar folder exists at the old name", () => {
    expect(() => renameAvatarFolder(userDataDir, "stack", "Missing", "New")).not.toThrow();
    expect(fs.existsSync(avatarDirPath(userDataDir, "stack", "New"))).toBe(false);
  });

  it("is a no-op for a case-only name change", () => {
    writeCustomAvatar(userDataDir, "stack", "Work", writeSourceImage("pic.png"));
    renameAvatarFolder(userDataDir, "stack", "Work", "WORK");
    expect(fs.existsSync(avatarDirPath(userDataDir, "stack", "Work"))).toBe(true);
  });
});
