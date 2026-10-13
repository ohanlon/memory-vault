import { describe, expect, it, vi } from "vitest";
import { filterCommands, flattenMenus } from "./paletteCommands";

describe("flattenMenus", () => {
  it("flattens nested items, skipping separators, disabled items and triggers", () => {
    const run = vi.fn();
    const cmds = flattenMenus([
      {
        label: "File",
        items: [
          { label: "New Note", onClick: run },
          { separator: true },
          { label: "New Folder", disabled: true, onClick: run },
          { label: "More", children: [{ label: "Deep", onClick: run }] },
        ],
      },
    ]);
    expect(cmds.map((c) => c.label)).toEqual(["File › New Note", "File › More › Deep"]);
    cmds[0].run();
    expect(run).toHaveBeenCalledOnce();
  });
});

describe("filterCommands", () => {
  const cmds = [{ label: "File › New Note" }, { label: "View › Tasks" }, { label: "View › Graph" }];
  it("returns everything for an empty query", () => {
    expect(filterCommands(cmds, "  ")).toHaveLength(3);
  });
  it("requires all terms, case-insensitively", () => {
    expect(filterCommands(cmds, "view TASK").map((c) => c.label)).toEqual(["View › Tasks"]);
  });
  it("returns nothing when no match", () => {
    expect(filterCommands(cmds, "zzz")).toEqual([]);
  });
});
