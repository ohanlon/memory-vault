import type { PropertyDef } from "./types";

// Advisory validation only — the caller decides whether to still save an
// invalid value (this app does: validation is a hint, not a hard gate).
export function validatePropertyValue(def: PropertyDef, value: unknown): string | null {
  switch (def.type) {
    case "text":
      return validateText(def, value);
    case "number":
      return validateNumber(def, value);
    case "list":
    case "checkbox":
    case "date":
    case "datetime":
      return null;
  }
}

function validateText(def: PropertyDef, value: unknown): string | null {
  if (typeof value !== "string") return null;
  const { maxLength, pattern } = def.rules ?? {};
  if (typeof maxLength === "number" && value.length > maxLength) {
    return `Must be ${maxLength} characters or fewer`;
  }
  if (pattern && value.length > 0) {
    let re: RegExp;
    try {
      re = new RegExp(pattern);
    } catch {
      return null; // an invalid saved pattern shouldn't block/crash the panel
    }
    if (!re.test(value)) return "Does not match the required format";
  }
  return null;
}

function validateNumber(def: PropertyDef, value: unknown): string | null {
  if (typeof value !== "number" || Number.isNaN(value)) return null;
  const { min, max, integerOnly } = def.rules ?? {};
  if (integerOnly && !Number.isInteger(value)) return "Must be a whole number";
  if (typeof min === "number" && value < min) return `Must be at least ${min}`;
  if (typeof max === "number" && value > max) return `Must be at most ${max}`;
  return null;
}
