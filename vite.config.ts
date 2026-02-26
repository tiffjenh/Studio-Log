import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const srcRoot = path.resolve(__dirname, "src");

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5001,
    strictPort: true, // mobile-view-branch: use 5001 so main can stay on 5000
    headers: { "Cache-Control": "no-store" },
  },
  resolve: {
    alias: [
      { find: /^@\//, replacement: srcRoot + "/" },
    ],
  },
});
