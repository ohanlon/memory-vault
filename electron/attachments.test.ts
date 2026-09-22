import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { saveAttachment } from "./attachments";

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "cairn-attachments-test-"));
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

describe("saveAttachment", () => {
  it("creates the attachments folder and writes the file under it", () => {
    const root = tmpDir();
    fs.mkdirSync(root, { recursive: true });

    const relPath = saveAttachment(root, "foo.png", Buffer.from("data"));

    expect(relPath).toBe("attachments/foo.png");
    expect(fs.readFileSync(path.join(root, "attachments", "foo.png"))).toEqual(Buffer.from("data"));
  });

  it("auto-renames on a filename collision instead of overwriting", () => {
    const root = tmpDir();
    fs.mkdirSync(root, { recursive: true });

    saveAttachment(root, "foo.png", Buffer.from("first"));
    const second = saveAttachment(root, "foo.png", Buffer.from("second"));

    expect(second).toBe("attachments/foo 1.png");
    expect(fs.readFileSync(path.join(root, "attachments", "foo.png"))).toEqual(Buffer.from("first"));
    expect(fs.readFileSync(path.join(root, "attachments", "foo 1.png"))).toEqual(Buffer.from("second"));
  });

  it("returns a posix-separated relative path even conceptually nested", () => {
    const root = tmpDir();
    fs.mkdirSync(root, { recursive: true });

    const relPath = saveAttachment(root, "image.jpg", Buffer.from("x"));

    expect(relPath).not.toContain("\\");
  });
});
