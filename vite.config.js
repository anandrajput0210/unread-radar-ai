import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const isolationHeaders = {
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Embedder-Policy": "require-corp",
};

export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: "./",
  server: {
    headers: isolationHeaders,
  },
  preview: {
    headers: isolationHeaders,
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    // The optional WebLLM runtime is lazy-loaded; its current deferred chunk is about 6 MB.
    chunkSizeWarningLimit: 7000,
  },
});
