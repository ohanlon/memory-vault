import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { listSnapshots, readSnapshot, recordSnapshot } from "./noteHistory";

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "cairn-history-test-"));
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

describe("recordSnapshot / listSnapshots / readSnapshot", () => {
  it("records a snapshot retrievable by its timestamp", () => {
    const historyRoot = tmpDir();
    const folderRoot = tmpDir();
    const now = new Date("2026-01-01T10:00:00.000Z");

    recordSnapshot(historyRoot, folderRoot, "Note.md", "version one", { now });

    const versions = listSnapshots(historyRoot, folderRoot, "Note.md");
    expect(versions).toEqual([{ timestamp: "2026-01-01T10:00:00.000Z" }]);
    expect(readSnapshot(historyRoot, folderRoot, "Note.md", "2026-01-01T10:00:00.000Z")).toBe("version one");
  });

  it("returns null for a timestamp with no matching snapshot", () => {
    const historyRoot = tmpDir();
    expect(readSnapshot(historyRoot, tmpDir(), "Note.md", "2026-01-01T00:00:00.000Z")).toBeNull();
  });

  it("returns an empty list for a note with no history", () => {
    expect(listSnapshots(tmpDir(), tmpDir(), "Note.md")).toEqual([]);
  });

  it("throttles snapshots within minIntervalMs of the last one", () => {
    const historyRoot = tmpDir();
    const folderRoot = tmpDir();
    const first = new Date("2026-01-01T10:00:00.000Z");
    const soonAfter = new Date("2026-01-01T10:00:05.000Z"); // 5s later, under the 10min default

    recordSnapshot(historyRoot, folderRoot, "Note.md", "version one", { now: first });
    recordSnapshot(historyRoot, folderRoot, "Note.md", "version two", { now: soonAfter });

    const versions = listSnapshots(historyRoot, folderRoot, "Note.md");
    expect(versions).toHaveLength(1);
    expect(readSnapshot(historyRoot, folderRoot, "Note.md", versions[0].timestamp)).toBe("version one");
  });

  it("records a new snapshot once minIntervalMs has passed", () => {
    const historyRoot = tmpDir();
    const folderRoot = tmpDir();
    const first = new Date("2026-01-01T10:00:00.000Z");
    const later = new Date("2026-01-01T10:11:00.000Z"); // 11 minutes later

    recordSnapshot(historyRoot, folderRoot, "Note.md", "version one", { now: first });
    recordSnapshot(historyRoot, folderRoot, "Note.md", "version two", { now: later });

    expect(listSnapshots(historyRoot, folderRoot, "Note.md")).toHaveLength(2);
  });

  it("force bypasses the throttle", () => {
    const historyRoot = tmpDir();
    const folderRoot = tmpDir();
    const first = new Date("2026-01-01T10:00:00.000Z");
    const soonAfter = new Date("2026-01-01T10:00:05.000Z");

    recordSnapshot(historyRoot, folderRoot, "Note.md", "version one", { now: first });
    recordSnapshot(historyRoot, folderRoot, "Note.md", "version two", { now: soonAfter, force: true });

    expect(listSnapshots(historyRoot, folderRoot, "Note.md")).toHaveLength(2);
  });

  it("prunes the oldest snapshots past maxSnapshots", () => {
    const historyRoot = tmpDir();
    const folderRoot = tmpDir();

    for (let i = 0; i < 5; i++) {
      recordSnapshot(historyRoot, folderRoot, "Note.md", `version ${i}`, {
        now: new Date(2026, 0, 1, 10, i),
        maxSnapshots: 3,
        force: true,
      });
    }

    const versions = listSnapshots(historyRoot, folderRoot, "Note.md");
    expect(versions).toHaveLength(3);
    // Newest first; the oldest two (version 0, version 1) were pruned.
    expect(readSnapshot(historyRoot, folderRoot, "Note.md", versions[2].timestamp)).toBe("version 2");
  });

  it("lists snapshots newest first", () => {
    const historyRoot = tmpDir();
    const folderRoot = tmpDir();

    recordSnapshot(historyRoot, folderRoot, "Note.md", "older", { now: new Date("2026-01-01T10:00:00.000Z") });
    recordSnapshot(historyRoot, folderRoot, "Note.md", "newer", {
      now: new Date("2026-01-01T10:30:00.000Z"),
      force: true,
    });

    const versions = listSnapshots(historyRoot, folderRoot, "Note.md");
    expect(versions.map((v) => v.timestamp)).toEqual(["2026-01-01T10:30:00.000Z", "2026-01-01T10:00:00.000Z"]);
  });

  it("keeps history for the same relative note path isolated per folder root", () => {
    const historyRoot = tmpDir();
    const folderA = tmpDir();
    const folderB = tmpDir();
    const now = new Date("2026-01-01T10:00:00.000Z");

    recordSnapshot(historyRoot, folderA, "Note.md", "from folder A", { now });
    recordSnapshot(historyRoot, folderB, "Note.md", "from folder B", { now });

    expect(readSnapshot(historyRoot, folderA, "Note.md", "2026-01-01T10:00:00.000Z")).toBe("from folder A");
    expect(readSnapshot(historyRoot, folderB, "Note.md", "2026-01-01T10:00:00.000Z")).toBe("from folder B");
  });

  it("supports notes nested in subfolders", () => {
    const historyRoot = tmpDir();
    const folderRoot = tmpDir();
    const now = new Date("2026-01-01T10:00:00.000Z");

    recordSnapshot(historyRoot, folderRoot, path.join("Sub", "Note.md"), "nested content", { now });

    expect(readSnapshot(historyRoot, folderRoot, path.join("Sub", "Note.md"), "2026-01-01T10:00:00.000Z")).toBe(
      "nested content"
    );
  });
});
