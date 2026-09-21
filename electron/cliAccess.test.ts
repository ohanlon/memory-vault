import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  allowFolder,
  denyFolder,
  isFolderAllowed,
  readCliAccessFile,
  renameFolderAccess,
  writeCliAccessFile,
  type CliAccessFile,
} from "./cliAccess";

describe("isFolderAllowed / allowFolder / denyFolder", () => {
  it("denies a folder that has never been granted", () => {
    expect(isFolderAllowed({ allowed: [] }, "Work")).toBe(false);
  });

  it("allows a folder once granted", () => {
    const access = allowFolder({ allowed: [] }, "Work");
    expect(isFolderAllowed(access, "Work")).toBe(true);
  });

  it("matches case-insensitively", () => {
    const access = allowFolder({ allowed: [] }, "Work");
    expect(isFolderAllowed(access, "WORK")).toBe(true);
    expect(isFolderAllowed(access, "work")).toBe(true);
  });

  it("granting twice does not duplicate the entry", () => {
    const access = allowFolder(allowFolder({ allowed: [] }, "Work"), "Work");
    expect(access.allowed).toEqual(["Work"]);
  });

  it("denyFolder removes a granted folder case-insensitively", () => {
    const access = allowFolder({ allowed: [] }, "Work");
    expect(isFolderAllowed(denyFolder(access, "WORK"), "Work")).toBe(false);
  });

  it("denyFolder is a no-op when the folder was never granted", () => {
    const access: CliAccessFile = { allowed: ["Personal"] };
    expect(denyFolder(access, "Work")).toEqual(access);
  });

  it("does not mutate the input", () => {
    const access: CliAccessFile = { allowed: ["Personal"] };
    allowFolder(access, "Work");
    expect(access.allowed).toEqual(["Personal"]);
  });
});

describe("renameFolderAccess", () => {
  it("moves a grant from the old name to the new one", () => {
    const access = allowFolder({ allowed: [] }, "Work");
    const renamed = renameFolderAccess(access, "Work", "Job");
    expect(isFolderAllowed(renamed, "Work")).toBe(false);
    expect(isFolderAllowed(renamed, "Job")).toBe(true);
  });

  it("is a no-op when the old name was never granted", () => {
    const access: CliAccessFile = { allowed: ["Personal"] };
    expect(renameFolderAccess(access, "Work", "Job")).toEqual(access);
  });
});

describe("readCliAccessFile / writeCliAccessFile", () => {
  const tmpFile = path.join(os.tmpdir(), `cli-access-test-${process.pid}.json`);

  afterEach(() => {
    fs.rmSync(tmpFile, { force: true });
  });

  it("returns no allowed folders when the file does not exist", () => {
    expect(readCliAccessFile(tmpFile)).toEqual({ allowed: [] });
  });

  it("round-trips through disk", () => {
    const access: CliAccessFile = { allowed: ["Work", "Personal"] };
    writeCliAccessFile(tmpFile, access);
    expect(readCliAccessFile(tmpFile)).toEqual(access);
  });

  it("returns no allowed folders for corrupt JSON instead of throwing", () => {
    fs.writeFileSync(tmpFile, "{not valid json", "utf-8");
    expect(readCliAccessFile(tmpFile)).toEqual({ allowed: [] });
  });

  it("filters out non-string entries", () => {
    fs.writeFileSync(tmpFile, JSON.stringify({ allowed: ["Work", 1, null, "Personal"] }), "utf-8");
    expect(readCliAccessFile(tmpFile)).toEqual({ allowed: ["Work", "Personal"] });
  });

  it("treats a missing/malformed allowed field as empty", () => {
    fs.writeFileSync(tmpFile, JSON.stringify({}), "utf-8");
    expect(readCliAccessFile(tmpFile)).toEqual({ allowed: [] });
  });
});
