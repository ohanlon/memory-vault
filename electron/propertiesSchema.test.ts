import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  findPropertyByNameCI,
  propertiesFilePath,
  readPropertySchema,
  removePropertyDef,
  upsertPropertyDef,
  writePropertySchema,
} from "./propertiesSchema";
import type { PropertyDef } from "../shared/types";

describe("upsertPropertyDef", () => {
  it("adds a new definition to an empty schema", () => {
    const result = upsertPropertyDef([], { name: "status", type: "text" });
    expect(result).toEqual([{ name: "status", type: "text" }]);
  });

  it("trims whitespace from the name", () => {
    const result = upsertPropertyDef([], { name: "  status  ", type: "text" });
    expect(result[0].name).toBe("status");
  });

  it("rejects an empty name", () => {
    expect(() => upsertPropertyDef([], { name: "   ", type: "text" })).toThrow();
  });

  it("rejects a duplicate name with different casing", () => {
    const existing: PropertyDef[] = [{ name: "Status", type: "text" }];
    expect(() => upsertPropertyDef(existing, { name: "status", type: "number" })).toThrow(/already exists/);
  });

  it("edits an existing definition in place when previousName is given", () => {
    const existing: PropertyDef[] = [{ name: "status", type: "text" }];
    const result = upsertPropertyDef(existing, { name: "status", type: "number" }, "status");
    expect(result).toEqual([{ name: "status", type: "number" }]);
  });

  it("allows renaming a definition via previousName", () => {
    const existing: PropertyDef[] = [{ name: "status", type: "text" }];
    const result = upsertPropertyDef(existing, { name: "reading-status", type: "text" }, "status");
    expect(result).toEqual([{ name: "reading-status", type: "text" }]);
  });

  it("does not mutate the input array", () => {
    const existing: PropertyDef[] = [{ name: "status", type: "text" }];
    upsertPropertyDef(existing, { name: "rating", type: "number" });
    expect(existing).toHaveLength(1);
  });
});

describe("findPropertyByNameCI", () => {
  it("finds a definition regardless of case", () => {
    const schema: PropertyDef[] = [{ name: "Status", type: "text" }];
    expect(findPropertyByNameCI(schema, "status")).toEqual({ name: "Status", type: "text" });
  });
});

describe("removePropertyDef", () => {
  it("removes a definition by name case-insensitively", () => {
    const schema: PropertyDef[] = [
      { name: "status", type: "text" },
      { name: "rating", type: "number" },
    ];
    expect(removePropertyDef(schema, "STATUS")).toEqual([{ name: "rating", type: "number" }]);
  });
});

describe("readPropertySchema / writePropertySchema", () => {
  const tmpRoot = path.join(os.tmpdir(), `properties-schema-test-${process.pid}`);

  afterEach(() => {
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  it("returns an empty array when the file does not exist", () => {
    expect(readPropertySchema(tmpRoot)).toEqual([]);
  });

  it("creates the .stack directory on first write", () => {
    expect(fs.existsSync(path.dirname(propertiesFilePath(tmpRoot)))).toBe(false);
    writePropertySchema(tmpRoot, [{ name: "status", type: "text" }]);
    expect(fs.existsSync(path.dirname(propertiesFilePath(tmpRoot)))).toBe(true);
  });

  it("round-trips a schema through disk", () => {
    const schema: PropertyDef[] = [
      { name: "status", type: "text", rules: { maxLength: 20 } },
      { name: "rating", type: "number", rules: { min: 0, max: 5, integerOnly: true } },
    ];
    writePropertySchema(tmpRoot, schema);
    expect(readPropertySchema(tmpRoot)).toEqual(schema);
  });

  it("returns an empty array for malformed YAML instead of throwing", () => {
    fs.mkdirSync(path.dirname(propertiesFilePath(tmpRoot)), { recursive: true });
    fs.writeFileSync(propertiesFilePath(tmpRoot), "properties: [not: valid: yaml", "utf-8");
    expect(readPropertySchema(tmpRoot)).toEqual([]);
  });

  it("filters out entries missing a valid name or type", () => {
    fs.mkdirSync(path.dirname(propertiesFilePath(tmpRoot)), { recursive: true });
    fs.writeFileSync(
      propertiesFilePath(tmpRoot),
      "properties:\n  - name: status\n  - type: text\n  - name: rating\n    type: bogus\n",
      "utf-8"
    );
    expect(readPropertySchema(tmpRoot)).toEqual([]);
  });
});
