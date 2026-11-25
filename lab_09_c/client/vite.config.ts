import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Dev: UI on :5185, API proxied to the server on :3012.
// Build: output goes straight into server/public, which the server serves in production.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5185,
    strictPort: true,
    proxy: { "/api": { target: "http://localhost:3012", changeOrigin: true } },
  },
  build: {
    outDir: "../server/public",
    emptyOutDir: true,
    chunkSizeWarningLimit: 1500,
  },
});
