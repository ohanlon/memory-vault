// Packages dist-electron/cliMain.cjs (built by `vite build`) into a
// self-contained `cairn-cli` executable using Node's Single Executable
// Applications feature, so running the CLI doesn't require Node to be
// installed - only the MCP server does, since it's launched via `node`
// directly from an MCP client config.
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { inject } from "postject";

const repoRoot = path.resolve(import.meta.dirname, "..");
const seaConfig = path.join(repoRoot, "sea-config.json");
const blobPath = path.join(repoRoot, "dist-electron", "cli.blob");
const outputDir = path.join(repoRoot, "release");
const outputExe = path.join(outputDir, process.platform === "win32" ? "cairn-cli.exe" : "cairn-cli");

if (!existsSync(path.join(repoRoot, "dist-electron", "cliMain.cjs"))) {
  console.error("dist-electron/cliMain.cjs not found - run `vite build` first.");
  process.exit(1);
}

mkdirSync(outputDir, { recursive: true });

execFileSync(process.execPath, ["--experimental-sea-config", seaConfig], { stdio: "inherit", cwd: repoRoot });

copyFileSync(process.execPath, outputExe);

if (process.platform === "darwin") {
  try {
    execFileSync("codesign", ["--remove-signature", outputExe], { stdio: "inherit" });
  } catch {
    console.warn("codesign not available; skipping signature removal (injection may fail without it).");
  }
}

await inject(outputExe, "NODE_SEA_BLOB", readFileSync(blobPath), {
  sentinelFuse: "NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2",
  overwrite: true,
  machoSegmentName: process.platform === "darwin" ? "NODE_SEA" : undefined,
});

console.log(`Built ${outputExe}`);
