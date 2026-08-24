import { describe, expect, it } from "vitest";
import { validatePropertyValue } from "./validateProperty";
import type { PropertyDef } from "./types";

describe("validatePropertyValue", () => {
  it("accepts text at exactly the maxLength boundary", () => {
    const def: PropertyDef = { name: "status", type: "text", rules: { maxLength: 4 } };
    expect(validatePropertyValue(def, "abcd")).toBeNull();
  });

  it("rejects text over the maxLength boundary", () => {
    const def: PropertyDef = { name: "status", type: "text", rules: { maxLength: 4 } };
    expect(validatePropertyValue(def, "abcde")).not.toBeNull();
  });

  it("rejects text that does not match the pattern", () => {
    const def: PropertyDef = { name: "code", type: "text", rules: { pattern: "^[A-Z]+$" } };
    expect(validatePropertyValue(def, "abc")).not.toBeNull();
    expect(validatePropertyValue(def, "ABC")).toBeNull();
  });

  it("does not throw on an invalid saved regex pattern", () => {
    const def: PropertyDef = { name: "code", type: "text", rules: { pattern: "(unterminated" } };
    expect(() => validatePropertyValue(def, "abc")).not.toThrow();
    expect(validatePropertyValue(def, "abc")).toBeNull();
  });

  it("validates number min/max boundaries", () => {
    const def: PropertyDef = { name: "rating", type: "number", rules: { min: 0, max: 5 } };
    expect(validatePropertyValue(def, 0)).toBeNull();
    expect(validatePropertyValue(def, 5)).toBeNull();
    expect(validatePropertyValue(def, -1)).not.toBeNull();
    expect(validatePropertyValue(def, 6)).not.toBeNull();
  });

  it("rejects decimals when integerOnly is set", () => {
    const def: PropertyDef = { name: "rating", type: "number", rules: { integerOnly: true } };
    expect(validatePropertyValue(def, 4)).toBeNull();
    expect(validatePropertyValue(def, 4.5)).not.toBeNull();
  });

  it("list, checkbox, date, and datetime always pass (no rules in v1)", () => {
    expect(validatePropertyValue({ name: "authors", type: "list" }, ["a", "b"])).toBeNull();
    expect(validatePropertyValue({ name: "done", type: "checkbox" }, true)).toBeNull();
    expect(validatePropertyValue({ name: "start", type: "date" }, "2026-08-24")).toBeNull();
    expect(validatePropertyValue({ name: "start", type: "datetime" }, "2026-08-24T10:00")).toBeNull();
  });
});
