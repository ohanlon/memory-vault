import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import electron from "vite-plugin-electron/simple";
import electronEntry from "vite-plugin-electron";
import path from "node:path";

export default defineConfig({
  plugins: [
    react(),
    electron({
      main: {
        entry: "electron/main.ts",
        vite: {
          build: {
            outDir: "dist-electron",
          },
        },
      },
      preload: {
        input: {
          preload: path.join(__dirname, "electron/preload.ts"),
        },
        vite: {
          build: {
            outDir: "dist-electron",
            rollupOptions: {
              output: {
                entryFileNames: "[name].mjs",
                inlineDynamicImports: false,
              },
            },
          },
        },
      },
      renderer: {},
    }),
    // Standalone MCP server entry point - a plain Node/stdio process, not
    // part of the Electron app itself, so it's a separate build target
    // (vite-plugin-electron/simple only supports the fixed main/preload/
    // renderer shape) bundled the same way and to the same output dir.
    electronEntry({
      entry: "electron/mcpServer.ts",
      vite: {
        build: {
          outDir: "dist-electron",
        },
      },
    }),
  ],
  resolve: {
    alias: {
      "@shared": path.resolve(__dirname, "shared"),
    },
  },
});
