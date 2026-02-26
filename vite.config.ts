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
    port: 5000,
    strictPort: true, // always use 5000; fail if in use so you can stop the other process
    headers: { "Cache-Control": "no-store" },
  },
  resolve: {
    alias: [
      { find: /^@\//, replacement: srcRoot + "/" },
    ],
  },
});
