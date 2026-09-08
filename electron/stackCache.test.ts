import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { readStackCache, stackCacheFilePath, writeStackCache } from "./stackCache";

describe("readStackCache / writeStackCache", () => {
  const stackRoot = path.join(os.tmpdir(), `stack-cache-test-${process.pid}`);

  afterEach(() => {
    fs.rmSync(stackRoot, { recursive: true, force: true });
  });

  it("returns null when the file does not exist", () => {
    expect(readStackCache(stackRoot)).toBeNull();
  });

  it("creates the .cairn directory on first write", () => {
    expect(fs.existsSync(path.join(stackRoot, ".cairn"))).toBe(false);
    writeStackCache(stackRoot, { notes: [] });
    expect(fs.existsSync(stackCacheFilePath(stackRoot))).toBe(true);
  });

  it("round-trips notes through disk", () => {
    const cache = {
      notes: [
        {
          path: path.join(stackRoot, "a.md"),
          title: "a",
          relativePath: "a.md",
          frontmatter: {},
          tags: [],
          links: [],
          content: "hello",
          mtimeMs: 123,
        },
      ],
    };
    writeStackCache(stackRoot, cache);
    expect(readStackCache(stackRoot)).toEqual(cache);
  });

  it("returns null for corrupt JSON instead of throwing", () => {
    fs.mkdirSync(path.join(stackRoot, ".cairn"), { recursive: true });
    fs.writeFileSync(stackCacheFilePath(stackRoot), "{not valid json", "utf-8");
    expect(readStackCache(stackRoot)).toBeNull();
  });

  it("returns null for a malformed shape", () => {
    fs.mkdirSync(path.join(stackRoot, ".cairn"), { recursive: true });
    fs.writeFileSync(stackCacheFilePath(stackRoot), JSON.stringify({ notes: "not an array" }), "utf-8");
    expect(readStackCache(stackRoot)).toBeNull();
  });
});
