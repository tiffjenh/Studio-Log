import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const srcRoot = path.resolve(__dirname, "src");

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
    strictPort: true,
    headers: { "Cache-Control": "no-store" },
  },
  resolve: {
    alias: [
      { find: /^@\//, replacement: srcRoot + "/" },
    ],
  },
});
