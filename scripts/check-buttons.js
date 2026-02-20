import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const srcDir = path.join(projectRoot, "src");
const buttonComponentPath = path.join(srcDir, "components", "ui", "Button.tsx");

const patterns = [
  /<button\b/g,
  /role="button"/g,
  /className="pill/g,
  /className="btn/g,
];

function walk(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walk(full));
      continue;
    }
    if (!/\.(ts|tsx|js|jsx)$/.test(entry.name)) continue;
    files.push(full);
  }
  return files;
}

const files = walk(srcDir).filter((f) => f !== buttonComponentPath);
const violations = [];

for (const file of files) {
  const text = fs.readFileSync(file, "utf8");
  const lines = text.split(/\r?\n/);
  lines.forEach((line, idx) => {
    if (patterns.some((p) => p.test(line))) {
      violations.push(`${path.relative(projectRoot, file)}:${idx + 1}: ${line.trim()}`);
    }
    patterns.forEach((p) => {
      p.lastIndex = 0;
    });
  });
}

if (violations.length > 0) {
  console.error("Raw button styles found. Use shared Button/IconButton.");
  console.error(violations.join("\n"));
  process.exit(1);
}

console.log("Button usage check passed.");
