import { describe, expect, it } from "vitest";
import { entriesAtPath } from "./contextMenuNav";
import type { ContextMenuEntry } from "./ContextMenu";

const root: ContextMenuEntry[] = [
  { label: "A", onClick: () => {} },
  { label: "Format", children: [{ label: "Bold" }, { label: "More", children: [{ label: "Deep" }] }] },
];

describe("entriesAtPath", () => {
  it("returns the root for an empty path", () => {
    expect(entriesAtPath(root, []).entries).toBe(root);
  });
  it("drills into nested submenus", () => {
    const r = entriesAtPath(root, ["Format", "More"]);
    expect(r.path).toEqual(["Format", "More"]);
    expect(r.entries.map((e) => ("separator" in e ? "-" : e.label))).toEqual(["Deep"]);
  });
  it("stops at the last level that resolves", () => {
    expect(entriesAtPath(root, ["Format", "Nope"]).path).toEqual(["Format"]);
  });
  it("does not drill into a leaf", () => {
    expect(entriesAtPath(root, ["A"]).path).toEqual([]);
  });
});
