import { defineConfig } from "vitest/config";
import path from "node:path";

// Deliberately separate from vite.config.ts: that config's
// vite-plugin-electron-renderer shims node:fs/etc. for the renderer bundle,
// which breaks electron/*.test.ts files that import node:fs directly to
// test main-process logic (e.g. vaultRegistry.test.ts).
export default defineConfig({
  resolve: {
    alias: {
      "@shared": path.resolve(__dirname, "shared"),
    },
  },
});
