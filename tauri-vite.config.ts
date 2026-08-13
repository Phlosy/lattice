// Standalone Vite config to build the React renderer for the Tauri shell.
// (The Electron build uses electron-vite; this one targets Tauri's frontendDist.)

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

export default defineConfig({
  root: "src/renderer",
  plugins: [react()],
  resolve: {
    alias: {
      "@renderer": resolve("src/renderer/src"),
      "@shared": resolve("src/shared"),
    },
  },
  build: {
    outDir: resolve("poc/tauri-app/dist"),
    emptyOutDir: true,
    target: "es2022",
  },
});
