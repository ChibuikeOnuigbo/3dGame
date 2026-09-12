import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  build: {
    outDir: "dist",
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 1200,
  },
  server: {
    host: "0.0.0.0",
    port: 5173,
    // Allow the Arena preview proxy host (and any reverse proxy) through
    // Vite's host check so the live preview loads.
    allowedHosts: true,
  },
});
