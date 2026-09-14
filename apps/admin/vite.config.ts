import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

// Paths that leave this app go up two levels to the workspace root. There is no
// alias to another app and there must never be one — packages/domain is the only
// way code travels between apps. packages/domain/workspace-boundaries.test.ts
// holds that shut.
const repoRoot = path.resolve(import.meta.dirname, "..", "..");

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      "@shared": path.resolve(repoRoot, "packages", "domain"),
    },
  },
  root: import.meta.dirname,
  build: {
    outDir: path.resolve(repoRoot, "dist/admin"),
    emptyOutDir: true,
  },
  server: {
    host: "0.0.0.0",
    port: 5001,
    proxy: { "/api": { target: "http://localhost:3001", changeOrigin: true } },
    fs: { strict: true, allow: [repoRoot], deny: ["**/.*"] },
  },
});
