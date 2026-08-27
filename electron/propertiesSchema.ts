import fs from "node:fs";
import path from "node:path";
import * as yaml from "js-yaml";
import type { PropertyDef } from "../shared/types";

export function propertiesFilePath(stackRoot: string): string {
  return path.join(stackRoot, ".stack", "properties.yaml");
}

export function readPropertySchema(stackRoot: string): PropertyDef[] {
  const filePath = propertiesFilePath(stackRoot);
  if (!fs.existsSync(filePath)) return [];
  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    const parsed = yaml.load(raw) as { properties?: unknown } | null;
    if (!parsed || !Array.isArray(parsed.properties)) return [];
    return parsed.properties.filter(isValidPropertyDef);
  } catch {
    return [];
  }
}

export function writePropertySchema(stackRoot: string, properties: PropertyDef[]): void {
  const filePath = propertiesFilePath(stackRoot);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, yaml.dump({ properties }, { sortKeys: false }), "utf-8");
}

export function findPropertyByNameCI(schema: PropertyDef[], name: string): PropertyDef | undefined {
  const lower = name.toLowerCase();
  return schema.find((p) => p.name.toLowerCase() === lower);
}

// Adds a new definition, or edits one in place when previousName is given
// (allowing the name itself to change while checking uniqueness against
// every other entry).
export function upsertPropertyDef(
  schema: PropertyDef[],
  def: PropertyDef,
  previousName?: string
): PropertyDef[] {
  const trimmed = def.name.trim();
  if (!trimmed) throw new Error("Property name cannot be empty");

  const others = previousName
    ? schema.filter((p) => p.name.toLowerCase() !== previousName.toLowerCase())
    : schema;
  if (findPropertyByNameCI(others, trimmed)) {
    throw new Error(`A property named "${trimmed}" already exists`);
  }

  const normalized: PropertyDef = { ...def, name: trimmed };
  if (previousName && findPropertyByNameCI(schema, previousName)) {
    return schema.map((p) => (p.name.toLowerCase() === previousName.toLowerCase() ? normalized : p));
  }
  return [...others, normalized];
}

export function removePropertyDef(schema: PropertyDef[], name: string): PropertyDef[] {
  const lower = name.toLowerCase();
  return schema.filter((p) => p.name.toLowerCase() !== lower);
}

const PROPERTY_TYPES = ["text", "list", "number", "checkbox", "date", "datetime"];

function isValidPropertyDef(v: unknown): v is PropertyDef {
  if (!v || typeof v !== "object") return false;
  const { name, type } = v as { name?: unknown; type?: unknown };
  return typeof name === "string" && name.length > 0 && typeof type === "string" && PROPERTY_TYPES.includes(type);
}
