import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  addCairn,
  findCairnByNameCI,
  readCairnsFile,
  removeCairn,
  renameCairn,
  updateCairnMembers,
  writeCairnsFile,
} from "./cairnRegistry";
import type { CairnEntry } from "../shared/types";

describe("addCairn", () => {
  it("adds a Cairn with its member stacks", () => {
    const result = addCairn([], "Life", ["Work", "Personal"]);
    expect(result).toEqual([{ name: "Life", memberStackNames: ["Work", "Personal"] }]);
  });

  it("trims whitespace from the name", () => {
    const result = addCairn([], "  Life  ", ["Work", "Personal"]);
    expect(result[0].name).toBe("Life");
  });

  it("rejects an empty name", () => {
    expect(() => addCairn([], "   ", ["Work", "Personal"])).toThrow();
  });

  it("rejects a duplicate name with different casing", () => {
    const existing: CairnEntry[] = [{ name: "Life", memberStackNames: ["Work", "Personal"] }];
    expect(() => addCairn(existing, "life", ["A", "B"])).toThrow(/already exists/);
  });

  it("rejects fewer than two member stacks", () => {
    expect(() => addCairn([], "Life", ["Work"])).toThrow(/at least two/);
    expect(() => addCairn([], "Life", [])).toThrow(/at least two/);
  });

  it("dedupes member stack names case-insensitively", () => {
    const result = addCairn([], "Life", ["Work", "work", "Personal"]);
    expect(result[0].memberStackNames).toEqual(["Work", "Personal"]);
  });

  it("drops blank member names", () => {
    const result = addCairn([], "Life", ["Work", "  ", "Personal"]);
    expect(result[0].memberStackNames).toEqual(["Work", "Personal"]);
  });

  it("does not mutate the input array", () => {
    const existing: CairnEntry[] = [{ name: "Life", memberStackNames: ["Work", "Personal"] }];
    addCairn(existing, "Other", ["A", "B"]);
    expect(existing).toHaveLength(1);
  });
});

describe("findCairnByNameCI", () => {
  it("finds a Cairn regardless of case", () => {
    const cairns: CairnEntry[] = [{ name: "Life", memberStackNames: ["Work", "Personal"] }];
    expect(findCairnByNameCI(cairns, "life")).toEqual(cairns[0]);
    expect(findCairnByNameCI(cairns, "LIFE")).toEqual(cairns[0]);
  });

  it("returns undefined when no Cairn matches", () => {
    expect(findCairnByNameCI([], "anything")).toBeUndefined();
  });
});

describe("removeCairn", () => {
  it("removes a Cairn by name case-insensitively", () => {
    const cairns: CairnEntry[] = [
      { name: "Life", memberStackNames: ["Work", "Personal"] },
      { name: "Other", memberStackNames: ["A", "B"] },
    ];
    expect(removeCairn(cairns, "LIFE")).toEqual([{ name: "Other", memberStackNames: ["A", "B"] }]);
  });

  it("is a no-op when the name is not present", () => {
    const cairns: CairnEntry[] = [{ name: "Life", memberStackNames: ["Work", "Personal"] }];
    expect(removeCairn(cairns, "Missing")).toEqual(cairns);
  });
});

describe("renameCairn", () => {
  it("renames a Cairn by name case-insensitively", () => {
    const cairns: CairnEntry[] = [{ name: "Life", memberStackNames: ["Work", "Personal"] }];
    expect(renameCairn(cairns, "LIFE", "Everything")[0].name).toBe("Everything");
  });

  it("rejects an empty new name", () => {
    const cairns: CairnEntry[] = [{ name: "Life", memberStackNames: ["Work", "Personal"] }];
    expect(() => renameCairn(cairns, "Life", "   ")).toThrow();
  });

  it("rejects a new name that collides with a different Cairn", () => {
    const cairns: CairnEntry[] = [
      { name: "Life", memberStackNames: ["Work", "Personal"] },
      { name: "Other", memberStackNames: ["A", "B"] },
    ];
    expect(() => renameCairn(cairns, "Life", "other")).toThrow(/already exists/);
  });

  it("allows renaming to the same name (case change only)", () => {
    const cairns: CairnEntry[] = [{ name: "Life", memberStackNames: ["Work", "Personal"] }];
    expect(renameCairn(cairns, "Life", "LIFE")[0].name).toBe("LIFE");
  });
});

describe("updateCairnMembers", () => {
  it("replaces the member list", () => {
    const cairns: CairnEntry[] = [{ name: "Life", memberStackNames: ["Work", "Personal"] }];
    expect(updateCairnMembers(cairns, "Life", ["Work", "Personal", "Archive"])[0].memberStackNames).toEqual([
      "Work",
      "Personal",
      "Archive",
    ]);
  });

  it("rejects fewer than two member stacks", () => {
    const cairns: CairnEntry[] = [{ name: "Life", memberStackNames: ["Work", "Personal"] }];
    expect(() => updateCairnMembers(cairns, "Life", ["Work"])).toThrow(/at least two/);
  });

  it("is a no-op when the name is not present", () => {
    const cairns: CairnEntry[] = [{ name: "Life", memberStackNames: ["Work", "Personal"] }];
    expect(updateCairnMembers(cairns, "Missing", ["A", "B"])).toEqual(cairns);
  });
});

describe("readCairnsFile / writeCairnsFile", () => {
  const tmpFile = path.join(os.tmpdir(), `cairns-test-${process.pid}.json`);

  afterEach(() => {
    fs.rmSync(tmpFile, { force: true });
  });

  it("returns an empty array when the file does not exist", () => {
    expect(readCairnsFile(tmpFile)).toEqual([]);
  });

  it("round-trips a list of Cairns through disk", () => {
    const cairns: CairnEntry[] = [{ name: "Life", memberStackNames: ["Work", "Personal"] }];
    writeCairnsFile(tmpFile, cairns);
    expect(readCairnsFile(tmpFile)).toEqual(cairns);
  });

  it("returns an empty array for corrupt JSON instead of throwing", () => {
    fs.writeFileSync(tmpFile, "{not valid json", "utf-8");
    expect(readCairnsFile(tmpFile)).toEqual([]);
  });

  it("filters out malformed entries", () => {
    fs.writeFileSync(
      tmpFile,
      JSON.stringify([{ name: "Life" }, { memberStackNames: ["A"] }, { name: "X", memberStackNames: [1, 2] }]),
      "utf-8"
    );
    expect(readCairnsFile(tmpFile)).toEqual([]);
  });
});
