import fs from "node:fs";
import path from "node:path";
import { MERGED_VIEW_AVATAR_COUNT, defaultAvatarIndexForName } from "../shared/avatars";
import type { AvatarRef, MergedViewEntry } from "../shared/types";

export function readMergedViewsFile(filePath: string): MergedViewEntry[] {
  if (!fs.existsSync(filePath)) return [];
  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (v): v is MergedViewEntry =>
        v &&
        typeof v.name === "string" &&
        Array.isArray(v.memberStackNames) &&
        v.memberStackNames.every((m: unknown) => typeof m === "string")
    );
  } catch {
    return [];
  }
}

export function writeMergedViewsFile(filePath: string, mergedViews: MergedViewEntry[]): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(mergedViews, null, 2), "utf-8");
}

export function findMergedViewByNameCI(mergedViews: MergedViewEntry[], name: string): MergedViewEntry | undefined {
  const lower = name.toLowerCase();
  return mergedViews.find((c) => c.name.toLowerCase() === lower);
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

export function addMergedView(mergedViews: MergedViewEntry[], name: string, memberStackNames: string[]): MergedViewEntry[] {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Merged view name cannot be empty");
  if (findMergedViewByNameCI(mergedViews, trimmed)) {
    throw new Error(`A merged view named "${trimmed}" already exists`);
  }
  const members = dedupeMembers(memberStackNames);
  if (members.length < 2) {
    throw new Error("A merged view needs at least two member stacks");
  }
  const avatar: AvatarRef = { kind: "builtin", index: defaultAvatarIndexForName(trimmed, MERGED_VIEW_AVATAR_COUNT) };
  return [...mergedViews, { name: trimmed, memberStackNames: members, avatar }];
}

export function removeMergedView(mergedViews: MergedViewEntry[], name: string): MergedViewEntry[] {
  const lower = name.toLowerCase();
  return mergedViews.filter((c) => c.name.toLowerCase() !== lower);
}

export function renameMergedView(mergedViews: MergedViewEntry[], oldName: string, newName: string): MergedViewEntry[] {
  const trimmed = newName.trim();
  if (!trimmed) throw new Error("Merged view name cannot be empty");
  const lowerOld = oldName.toLowerCase();
  if (trimmed.toLowerCase() !== lowerOld && findMergedViewByNameCI(mergedViews, trimmed)) {
    throw new Error(`A merged view named "${trimmed}" already exists`);
  }
  return mergedViews.map((c) => (c.name.toLowerCase() === lowerOld ? { ...c, name: trimmed } : c));
}

export function updateMergedViewMembers(mergedViews: MergedViewEntry[], name: string, memberStackNames: string[]): MergedViewEntry[] {
  const lower = name.toLowerCase();
  const members = dedupeMembers(memberStackNames);
  if (members.length < 2) {
    throw new Error("A merged view needs at least two member stacks");
  }
  return mergedViews.map((c) => (c.name.toLowerCase() === lower ? { ...c, memberStackNames: members } : c));
}
