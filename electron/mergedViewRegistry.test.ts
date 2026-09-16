import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  addMergedView,
  findMergedViewByNameCI,
  readMergedViewsFile,
  removeMergedView,
  renameMergedView,
  updateMergedViewMembers,
  writeMergedViewsFile,
} from "./mergedViewRegistry";
import { MERGED_VIEW_AVATAR_COUNT, defaultAvatarIndexForName } from "../shared/avatars";
import type { MergedViewEntry } from "../shared/types";

describe("addMergedView", () => {
  it("adds a merged view with its member stacks", () => {
    const result = addMergedView([], "Life", ["Work", "Personal"]);
    expect(result).toEqual([
      {
        name: "Life",
        memberStackNames: ["Work", "Personal"],
        avatar: { kind: "builtin", index: defaultAvatarIndexForName("Life", MERGED_VIEW_AVATAR_COUNT) },
      },
    ]);
  });

  it("assigns a deterministic built-in avatar index", () => {
    const result = addMergedView([], "Other", ["A", "B"]);
    expect(result[0].avatar).toEqual({ kind: "builtin", index: defaultAvatarIndexForName("Other", MERGED_VIEW_AVATAR_COUNT) });
  });

  it("trims whitespace from the name", () => {
    const result = addMergedView([], "  Life  ", ["Work", "Personal"]);
    expect(result[0].name).toBe("Life");
  });

  it("rejects an empty name", () => {
    expect(() => addMergedView([], "   ", ["Work", "Personal"])).toThrow();
  });

  it("rejects a duplicate name with different casing", () => {
    const existing: MergedViewEntry[] = [{ name: "Life", memberStackNames: ["Work", "Personal"] }];
    expect(() => addMergedView(existing, "life", ["A", "B"])).toThrow(/already exists/);
  });

  it("rejects fewer than two member stacks", () => {
    expect(() => addMergedView([], "Life", ["Work"])).toThrow(/at least two/);
    expect(() => addMergedView([], "Life", [])).toThrow(/at least two/);
  });

  it("dedupes member stack names case-insensitively", () => {
    const result = addMergedView([], "Life", ["Work", "work", "Personal"]);
    expect(result[0].memberStackNames).toEqual(["Work", "Personal"]);
  });

  it("drops blank member names", () => {
    const result = addMergedView([], "Life", ["Work", "  ", "Personal"]);
    expect(result[0].memberStackNames).toEqual(["Work", "Personal"]);
  });

  it("does not mutate the input array", () => {
    const existing: MergedViewEntry[] = [{ name: "Life", memberStackNames: ["Work", "Personal"] }];
    addMergedView(existing, "Other", ["A", "B"]);
    expect(existing).toHaveLength(1);
  });
});

describe("findMergedViewByNameCI", () => {
  it("finds a merged view regardless of case", () => {
    const mergedViews: MergedViewEntry[] = [{ name: "Life", memberStackNames: ["Work", "Personal"] }];
    expect(findMergedViewByNameCI(mergedViews, "life")).toEqual(mergedViews[0]);
    expect(findMergedViewByNameCI(mergedViews, "LIFE")).toEqual(mergedViews[0]);
  });

  it("returns undefined when no merged view matches", () => {
    expect(findMergedViewByNameCI([], "anything")).toBeUndefined();
  });
});

describe("removeMergedView", () => {
  it("removes a merged view by name case-insensitively", () => {
    const mergedViews: MergedViewEntry[] = [
      { name: "Life", memberStackNames: ["Work", "Personal"] },
      { name: "Other", memberStackNames: ["A", "B"] },
    ];
    expect(removeMergedView(mergedViews, "LIFE")).toEqual([{ name: "Other", memberStackNames: ["A", "B"] }]);
  });

  it("is a no-op when the name is not present", () => {
    const mergedViews: MergedViewEntry[] = [{ name: "Life", memberStackNames: ["Work", "Personal"] }];
    expect(removeMergedView(mergedViews, "Missing")).toEqual(mergedViews);
  });
});

describe("renameMergedView", () => {
  it("renames a merged view by name case-insensitively", () => {
    const mergedViews: MergedViewEntry[] = [{ name: "Life", memberStackNames: ["Work", "Personal"] }];
    expect(renameMergedView(mergedViews, "LIFE", "Everything")[0].name).toBe("Everything");
  });

  it("rejects an empty new name", () => {
    const mergedViews: MergedViewEntry[] = [{ name: "Life", memberStackNames: ["Work", "Personal"] }];
    expect(() => renameMergedView(mergedViews, "Life", "   ")).toThrow();
  });

  it("rejects a new name that collides with a different merged view", () => {
    const mergedViews: MergedViewEntry[] = [
      { name: "Life", memberStackNames: ["Work", "Personal"] },
      { name: "Other", memberStackNames: ["A", "B"] },
    ];
    expect(() => renameMergedView(mergedViews, "Life", "other")).toThrow(/already exists/);
  });

  it("allows renaming to the same name (case change only)", () => {
    const mergedViews: MergedViewEntry[] = [{ name: "Life", memberStackNames: ["Work", "Personal"] }];
    expect(renameMergedView(mergedViews, "Life", "LIFE")[0].name).toBe("LIFE");
  });
});

describe("updateMergedViewMembers", () => {
  it("replaces the member list", () => {
    const mergedViews: MergedViewEntry[] = [{ name: "Life", memberStackNames: ["Work", "Personal"] }];
    expect(updateMergedViewMembers(mergedViews, "Life", ["Work", "Personal", "Archive"])[0].memberStackNames).toEqual([
      "Work",
      "Personal",
      "Archive",
    ]);
  });

  it("rejects fewer than two member stacks", () => {
    const mergedViews: MergedViewEntry[] = [{ name: "Life", memberStackNames: ["Work", "Personal"] }];
    expect(() => updateMergedViewMembers(mergedViews, "Life", ["Work"])).toThrow(/at least two/);
  });

  it("is a no-op when the name is not present", () => {
    const mergedViews: MergedViewEntry[] = [{ name: "Life", memberStackNames: ["Work", "Personal"] }];
    expect(updateMergedViewMembers(mergedViews, "Missing", ["A", "B"])).toEqual(mergedViews);
  });
});

describe("readMergedViewsFile / writeMergedViewsFile", () => {
  const tmpFile = path.join(os.tmpdir(), `mergedViews-test-${process.pid}.json`);

  afterEach(() => {
    fs.rmSync(tmpFile, { force: true });
  });

  it("returns an empty array when the file does not exist", () => {
    expect(readMergedViewsFile(tmpFile)).toEqual([]);
  });

  it("round-trips a list of merged views through disk", () => {
    const mergedViews: MergedViewEntry[] = [{ name: "Life", memberStackNames: ["Work", "Personal"] }];
    writeMergedViewsFile(tmpFile, mergedViews);
    expect(readMergedViewsFile(tmpFile)).toEqual(mergedViews);
  });

  it("returns an empty array for corrupt JSON instead of throwing", () => {
    fs.writeFileSync(tmpFile, "{not valid json", "utf-8");
    expect(readMergedViewsFile(tmpFile)).toEqual([]);
  });

  it("filters out malformed entries", () => {
    fs.writeFileSync(
      tmpFile,
      JSON.stringify([{ name: "Life" }, { memberStackNames: ["A"] }, { name: "X", memberStackNames: [1, 2] }]),
      "utf-8"
    );
    expect(readMergedViewsFile(tmpFile)).toEqual([]);
  });
});
