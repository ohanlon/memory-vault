import { defineConfig } from "vite";
import path from "node:path";

// Standalone Node entry points, built with `npm run build:cli`:
//   --mode mcp -> dist-electron/mcpServer.js: the MCP stdio server, launched with `node` by an MCP client.
//   --mode cli -> dist-electron/cliMain.cjs: the CLI, bundled to CommonJS because Node's Single
//                 Executable Applications feature (see sea-config.json) needs a CJS entry.
export default defineConfig(({ mode }) => {
  const cli = mode === "cli";
  return {
    resolve: { alias: { "@shared": path.resolve(__dirname, "shared") } },
    ssr: { noExternal: true },
    build: {
      ssr: path.resolve(__dirname, cli ? "electron/cliMain.ts" : "electron/mcpServer.ts"),
      outDir: "dist-electron",
      emptyOutDir: false,
      target: "node20",
      minify: false,
      rollupOptions: {
        output: cli
          ? { format: "cjs", entryFileNames: "cliMain.cjs" }
          : { format: "es", entryFileNames: "mcpServer.js" },
      },
    },
  };
});
