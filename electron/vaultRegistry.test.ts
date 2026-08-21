import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { addVault, findByNameCI, readVaultsFile, removeVault, writeVaultsFile } from "./vaultRegistry";
import type { VaultEntry } from "../shared/types";

describe("addVault", () => {
  it("adds a vault to an empty list", () => {
    const result = addVault([], "Work", "/vault/work");
    expect(result).toEqual([{ name: "Work", root: "/vault/work" }]);
  });

  it("trims whitespace from the name", () => {
    const result = addVault([], "  Work  ", "/vault/work");
    expect(result[0].name).toBe("Work");
  });

  it("rejects an empty name", () => {
    expect(() => addVault([], "   ", "/vault/work")).toThrow();
  });

  it("rejects a duplicate name with different casing", () => {
    const existing: VaultEntry[] = [{ name: "Work", root: "/vault/work" }];
    expect(() => addVault(existing, "work", "/vault/other")).toThrow(/already exists/);
    expect(() => addVault(existing, "WORK", "/vault/other")).toThrow(/already exists/);
  });

  it("allows two different names pointing at different folders", () => {
    const existing: VaultEntry[] = [{ name: "Work", root: "/vault/work" }];
    const result = addVault(existing, "Personal", "/vault/personal");
    expect(result).toHaveLength(2);
  });

  it("does not mutate the input array", () => {
    const existing: VaultEntry[] = [{ name: "Work", root: "/vault/work" }];
    addVault(existing, "Personal", "/vault/personal");
    expect(existing).toHaveLength(1);
  });
});

describe("findByNameCI", () => {
  it("finds a vault regardless of case", () => {
    const vaults: VaultEntry[] = [{ name: "Work", root: "/vault/work" }];
    expect(findByNameCI(vaults, "work")).toEqual({ name: "Work", root: "/vault/work" });
    expect(findByNameCI(vaults, "WORK")).toEqual({ name: "Work", root: "/vault/work" });
  });

  it("returns undefined when no vault matches", () => {
    expect(findByNameCI([], "anything")).toBeUndefined();
  });
});

describe("removeVault", () => {
  it("removes a vault by name case-insensitively", () => {
    const vaults: VaultEntry[] = [
      { name: "Work", root: "/vault/work" },
      { name: "Personal", root: "/vault/personal" },
    ];
    expect(removeVault(vaults, "WORK")).toEqual([{ name: "Personal", root: "/vault/personal" }]);
  });

  it("is a no-op when the name is not present", () => {
    const vaults: VaultEntry[] = [{ name: "Work", root: "/vault/work" }];
    expect(removeVault(vaults, "Missing")).toEqual(vaults);
  });
});

describe("readVaultsFile / writeVaultsFile", () => {
  const tmpFile = path.join(os.tmpdir(), `vaults-test-${process.pid}.json`);

  afterEach(() => {
    fs.rmSync(tmpFile, { force: true });
  });

  it("returns an empty array when the file does not exist", () => {
    expect(readVaultsFile(tmpFile)).toEqual([]);
  });

  it("round-trips a list of vaults through disk", () => {
    const vaults: VaultEntry[] = [{ name: "Work", root: "/vault/work" }];
    writeVaultsFile(tmpFile, vaults);
    expect(readVaultsFile(tmpFile)).toEqual(vaults);
  });

  it("returns an empty array for corrupt JSON instead of throwing", () => {
    fs.writeFileSync(tmpFile, "{not valid json", "utf-8");
    expect(readVaultsFile(tmpFile)).toEqual([]);
  });

  it("filters out malformed entries", () => {
    fs.writeFileSync(tmpFile, JSON.stringify([{ name: "Work" }, { root: "/x" }, { name: 1, root: 2 }]), "utf-8");
    expect(readVaultsFile(tmpFile)).toEqual([]);
  });
});
