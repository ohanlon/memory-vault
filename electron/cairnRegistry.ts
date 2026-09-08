import fs from "node:fs";
import path from "node:path";
import type { CairnEntry } from "../shared/types";

export function readCairnsFile(filePath: string): CairnEntry[] {
  if (!fs.existsSync(filePath)) return [];
  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (v): v is CairnEntry =>
        v &&
        typeof v.name === "string" &&
        Array.isArray(v.memberStackNames) &&
        v.memberStackNames.every((m: unknown) => typeof m === "string")
    );
  } catch {
    return [];
  }
}

export function writeCairnsFile(filePath: string, cairns: CairnEntry[]): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(cairns, null, 2), "utf-8");
}

export function findCairnByNameCI(cairns: CairnEntry[], name: string): CairnEntry | undefined {
  const lower = name.toLowerCase();
  return cairns.find((c) => c.name.toLowerCase() === lower);
}

/** Trims, drops blanks, and case-insensitively dedupes a list of member stack names. */
function dedupeMembers(memberStackNames: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of memberStackNames) {
    const trimmed = raw.trim();
    if (!trimmed) continue;
    const lower = trimmed.toLowerCase();
    if (seen.has(lower)) continue;
    seen.add(lower);
    result.push(trimmed);
  }
  return result;
}

export function addCairn(cairns: CairnEntry[], name: string, memberStackNames: string[]): CairnEntry[] {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Cairn name cannot be empty");
  if (findCairnByNameCI(cairns, trimmed)) {
    throw new Error(`A Cairn named "${trimmed}" already exists`);
  }
  const members = dedupeMembers(memberStackNames);
  if (members.length < 2) {
    throw new Error("A Cairn needs at least two member stacks");
  }
  return [...cairns, { name: trimmed, memberStackNames: members }];
}

export function removeCairn(cairns: CairnEntry[], name: string): CairnEntry[] {
  const lower = name.toLowerCase();
  return cairns.filter((c) => c.name.toLowerCase() !== lower);
}

export function renameCairn(cairns: CairnEntry[], oldName: string, newName: string): CairnEntry[] {
  const trimmed = newName.trim();
  if (!trimmed) throw new Error("Cairn name cannot be empty");
  const lowerOld = oldName.toLowerCase();
  if (trimmed.toLowerCase() !== lowerOld && findCairnByNameCI(cairns, trimmed)) {
    throw new Error(`A Cairn named "${trimmed}" already exists`);
  }
  return cairns.map((c) => (c.name.toLowerCase() === lowerOld ? { ...c, name: trimmed } : c));
}

export function updateCairnMembers(cairns: CairnEntry[], name: string, memberStackNames: string[]): CairnEntry[] {
  const lower = name.toLowerCase();
  const members = dedupeMembers(memberStackNames);
  if (members.length < 2) {
    throw new Error("A Cairn needs at least two member stacks");
  }
  return cairns.map((c) => (c.name.toLowerCase() === lower ? { ...c, memberStackNames: members } : c));
}
