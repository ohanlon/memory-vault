import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { addStack, findByNameCI, readStacksFile, removeStack, renameStack, writeStacksFile } from "./stackRegistry";
import type { StackEntry } from "../shared/types";

describe("addStack", () => {
  it("adds a stack to an empty list", () => {
    const result = addStack([], "Work", "/stack/work");
    expect(result).toEqual([{ name: "Work", root: "/stack/work" }]);
  });

  it("trims whitespace from the name", () => {
    const result = addStack([], "  Work  ", "/stack/work");
    expect(result[0].name).toBe("Work");
  });

  it("rejects an empty name", () => {
    expect(() => addStack([], "   ", "/stack/work")).toThrow();
  });

  it("rejects a duplicate name with different casing", () => {
    const existing: StackEntry[] = [{ name: "Work", root: "/stack/work" }];
    expect(() => addStack(existing, "work", "/stack/other")).toThrow(/already exists/);
    expect(() => addStack(existing, "WORK", "/stack/other")).toThrow(/already exists/);
  });

  it("allows two different names pointing at different folders", () => {
    const existing: StackEntry[] = [{ name: "Work", root: "/stack/work" }];
    const result = addStack(existing, "Personal", "/stack/personal");
    expect(result).toHaveLength(2);
  });

  it("does not mutate the input array", () => {
    const existing: StackEntry[] = [{ name: "Work", root: "/stack/work" }];
    addStack(existing, "Personal", "/stack/personal");
    expect(existing).toHaveLength(1);
  });
});

describe("findByNameCI", () => {
  it("finds a stack regardless of case", () => {
    const stacks: StackEntry[] = [{ name: "Work", root: "/stack/work" }];
    expect(findByNameCI(stacks, "work")).toEqual({ name: "Work", root: "/stack/work" });
    expect(findByNameCI(stacks, "WORK")).toEqual({ name: "Work", root: "/stack/work" });
  });

  it("returns undefined when no stack matches", () => {
    expect(findByNameCI([], "anything")).toBeUndefined();
  });
});

describe("removeStack", () => {
  it("removes a stack by name case-insensitively", () => {
    const stacks: StackEntry[] = [
      { name: "Work", root: "/stack/work" },
      { name: "Personal", root: "/stack/personal" },
    ];
    expect(removeStack(stacks, "WORK")).toEqual([{ name: "Personal", root: "/stack/personal" }]);
  });

  it("is a no-op when the name is not present", () => {
    const stacks: StackEntry[] = [{ name: "Work", root: "/stack/work" }];
    expect(removeStack(stacks, "Missing")).toEqual(stacks);
  });
});

describe("renameStack", () => {
  it("renames a stack by name case-insensitively", () => {
    const stacks: StackEntry[] = [
      { name: "Work", root: "/stack/work" },
      { name: "Personal", root: "/stack/personal" },
    ];
    expect(renameStack(stacks, "WORK", "Job")).toEqual([
      { name: "Job", root: "/stack/work" },
      { name: "Personal", root: "/stack/personal" },
    ]);
  });

  it("trims whitespace from the new name", () => {
    const stacks: StackEntry[] = [{ name: "Work", root: "/stack/work" }];
    expect(renameStack(stacks, "Work", "  Job  ")[0].name).toBe("Job");
  });

  it("rejects an empty new name", () => {
    const stacks: StackEntry[] = [{ name: "Work", root: "/stack/work" }];
    expect(() => renameStack(stacks, "Work", "   ")).toThrow();
  });

  it("rejects a new name that collides with a different stack", () => {
    const stacks: StackEntry[] = [
      { name: "Work", root: "/stack/work" },
      { name: "Personal", root: "/stack/personal" },
    ];
    expect(() => renameStack(stacks, "Work", "personal")).toThrow(/already exists/);
  });

  it("allows renaming to the same name (case change only)", () => {
    const stacks: StackEntry[] = [{ name: "Work", root: "/stack/work" }];
    expect(renameStack(stacks, "Work", "WORK")[0].name).toBe("WORK");
  });

  it("does not mutate the input array", () => {
    const stacks: StackEntry[] = [{ name: "Work", root: "/stack/work" }];
    renameStack(stacks, "Work", "Job");
    expect(stacks[0].name).toBe("Work");
  });
});

describe("readStacksFile / writeStacksFile", () => {
  const tmpFile = path.join(os.tmpdir(), `stacks-test-${process.pid}.json`);

  afterEach(() => {
    fs.rmSync(tmpFile, { force: true });
  });

  it("returns an empty array when the file does not exist", () => {
    expect(readStacksFile(tmpFile)).toEqual([]);
  });

  it("round-trips a list of stacks through disk", () => {
    const stacks: StackEntry[] = [{ name: "Work", root: "/stack/work" }];
    writeStacksFile(tmpFile, stacks);
    expect(readStacksFile(tmpFile)).toEqual(stacks);
  });

  it("returns an empty array for corrupt JSON instead of throwing", () => {
    fs.writeFileSync(tmpFile, "{not valid json", "utf-8");
    expect(readStacksFile(tmpFile)).toEqual([]);
  });

  it("filters out malformed entries", () => {
    fs.writeFileSync(tmpFile, JSON.stringify([{ name: "Work" }, { root: "/x" }, { name: 1, root: 2 }]), "utf-8");
    expect(readStacksFile(tmpFile)).toEqual([]);
  });
});
