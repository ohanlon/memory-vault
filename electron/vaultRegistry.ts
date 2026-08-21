import fs from "node:fs";
import path from "node:path";
import type { VaultEntry } from "../shared/types";

export function readVaultsFile(filePath: string): VaultEntry[] {
  if (!fs.existsSync(filePath)) return [];
  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (v): v is VaultEntry =>
        v && typeof v.name === "string" && typeof v.root === "string"
    );
  } catch {
    return [];
  }
}

export function writeVaultsFile(filePath: string, vaults: VaultEntry[]): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(vaults, null, 2), "utf-8");
}

export function findByNameCI(vaults: VaultEntry[], name: string): VaultEntry | undefined {
  const lower = name.toLowerCase();
  return vaults.find((v) => v.name.toLowerCase() === lower);
}

export function addVault(vaults: VaultEntry[], name: string, root: string): VaultEntry[] {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Vault name cannot be empty");
  if (findByNameCI(vaults, trimmed)) {
    throw new Error(`A vault named "${trimmed}" already exists`);
  }
  return [...vaults, { name: trimmed, root }];
}

export function removeVault(vaults: VaultEntry[], name: string): VaultEntry[] {
  const lower = name.toLowerCase();
  return vaults.filter((v) => v.name.toLowerCase() !== lower);
}
