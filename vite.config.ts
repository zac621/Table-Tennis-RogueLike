import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig({
  base: "/",
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      "tailwind-merge": path.resolve(__dirname, "node_modules/tailwind-merge/dist/bundle-mjs.mjs"),
    },
    dedupe: ["react", "react-dom"],
  },
  optimizeDeps: {
    include: ["tailwind-merge"],
  },
  root: __dirname,
  build: {
    outDir: path.resolve(__dirname, "dist"),
    emptyOutDir: true,
  },
  server: {
    host: "0.0.0.0",
    port: 4173,
    strictPort: true,
    open: false,
  },
  preview: {
    host: "0.0.0.0",
    port: 4173,
  },
});
