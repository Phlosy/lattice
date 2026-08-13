import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        "@shared": resolve("src/shared"),
        "@main": resolve("src/main"),
      },
    },
    build: {
      rollupOptions: {
        input: { index: resolve("src/main/index.ts") },
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: { index: resolve("src/preload/index.ts") },
      },
    },
  },
  renderer: {
    root: "src/renderer",
    resolve: {
      alias: {
        "@renderer": resolve("src/renderer/src"),
        "@shared": resolve("src/shared"),
      },
    },
    plugins: [react()],
    build: {
      rollupOptions: {
        input: { index: resolve("src/renderer/index.html") },
      },
    },
  },
});
