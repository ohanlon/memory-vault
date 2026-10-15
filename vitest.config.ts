import { configDefaults, defineConfig } from "vitest/config";
import path from "node:path";

// Kept separate from vite.config.ts (the renderer build). The two Electron
// protocol tests are excluded: they import modules that need the `electron`
// package, which is no longer a dependency.
export default defineConfig({
  test: {
    exclude: [...configDefaults.exclude, "electron/attachmentProtocol.test.ts", "electron/pluginProtocol.test.ts"],
  },
  resolve: {
    alias: {
      "@shared": path.resolve(__dirname, "shared"),
    },
  },
});
