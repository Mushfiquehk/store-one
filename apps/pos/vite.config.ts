import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";

// The till's own config, living beside the till. Paths that leave this app go up
// two levels on purpose — an app reaching sideways into another app is the one
// thing the workspace layout exists to prevent, and a "../../apps/" in here would
// be the first sign it had started.
const repoRoot = path.resolve(import.meta.dirname, "..", "..");

export default defineConfig({
  plugins: [
    react(),
    runtimeErrorOverlay(),
    tailwindcss(),
    ...(process.env.NODE_ENV !== "production" &&
    process.env.REPL_ID !== undefined
      ? [
          await import("@replit/vite-plugin-cartographer").then((m) =>
            m.cartographer(),
          ),
          await import("@replit/vite-plugin-dev-banner").then((m) =>
            m.devBanner(),
          ),
        ]
      : []),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      "@shared": path.resolve(repoRoot, "packages", "domain"),
      "@assets": path.resolve(repoRoot, "attached_assets"),
    },
  },
  css: {
    postcss: {
      plugins: [],
    },
  },
  root: import.meta.dirname,
  build: {
    // Capacitor's webDir still points here (capacitor.config.ts), so the iOS
    // build is untouched by the move.
    outDir: path.resolve(repoRoot, "dist/public"),
    emptyOutDir: true,
  },
  server: {
    host: "0.0.0.0",
    allowedHosts: true,
    proxy: {
      "/api": {
        target: "http://localhost:3001",
        changeOrigin: true,
      },
    },
    fs: {
      strict: true,
      // The app root is apps/pos, but the alias targets above resolve outside
      // it — Vite must be allowed to read the workspace, or @shared 404s.
      allow: [repoRoot],
      deny: ["**/.*"],
    },
  },
});
