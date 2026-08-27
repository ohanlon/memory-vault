import fs from "node:fs";
import path from "node:path";
import type { StackEntry } from "../shared/types";

export function readStacksFile(filePath: string): StackEntry[] {
  if (!fs.existsSync(filePath)) return [];
  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (v): v is StackEntry =>
        v && typeof v.name === "string" && typeof v.root === "string"
    );
  } catch {
    return [];
  }
}

export function writeStacksFile(filePath: string, stacks: StackEntry[]): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(stacks, null, 2), "utf-8");
}

export function findByNameCI(stacks: StackEntry[], name: string): StackEntry | undefined {
  const lower = name.toLowerCase();
  return stacks.find((v) => v.name.toLowerCase() === lower);
}

export function addStack(stacks: StackEntry[], name: string, root: string): StackEntry[] {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Stack name cannot be empty");
  if (findByNameCI(stacks, trimmed)) {
    throw new Error(`A stack named "${trimmed}" already exists`);
  }
  return [...stacks, { name: trimmed, root }];
}

export function removeStack(stacks: StackEntry[], name: string): StackEntry[] {
  const lower = name.toLowerCase();
  return stacks.filter((v) => v.name.toLowerCase() !== lower);
}
