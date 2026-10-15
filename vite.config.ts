import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

// Renderer only. The native shell is the C# host (csharp/src/Cairn.Host), which
// serves dist/ and injects window.memoryStack. The Node CLI/MCP bundles are built
// by vite.node.config.ts.
export default defineConfig({
  base: "./",
  plugins: [react()],
  resolve: {
    alias: {
      "@shared": path.resolve(__dirname, "shared"),
    },
  },
});
