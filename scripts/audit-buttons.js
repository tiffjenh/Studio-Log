#!/usr/bin/env node
/**
 * STEP 1 — Button audit: count variants and list locations.
 * Run: node scripts/audit-buttons.js
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const src = path.join(__dirname, "..", "src");
const css = fs.readFileSync(path.join(src, "index.css"), "utf8");

const variants = [];

// CSS classes
if (css.includes(".btn ") || css.includes(".btn{")) variants.push({ name: ".btn", where: "index.css" });
if (css.includes(".btn-primary")) variants.push({ name: ".btn-primary", where: "index.css" });
if (css.includes(".pill ")) variants.push({ name: ".pill", where: "index.css" });
if (css.includes(".pill--active")) variants.push({ name: ".pill--active", where: "index.css" });
if (css.includes(".landing__tab")) variants.push({ name: ".landing__tab / .landing__tab--active", where: "index.css" });

// Inline patterns (counted by file)
const buttonPatterns = [
  { pattern: /<button[\s\S]*?>/g, label: "raw <button>" },
  { pattern: /className="pill/g, label: "className pill" },
  { pattern: /className="btn/g, label: "className btn" },
  { pattern: /background:.*gradient|var\(--avatar-gradient\)/g, label: "gradient fill" },
  { pattern: /#dc2626|rgba\(220,38,38|color:.*red|danger|delete|terminate/i, label: "destructive/red" },
  { pattern: /borderRadius: 999|radius-pill/g, label: "pill radius" },
  { pattern: /borderRadius: 12|border-radius: 12/g, label: "12px radius" },
];

function walk(dir, list) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory() && !e.name.startsWith(".") && e.name !== "node_modules") walk(full, list);
    else if (e.isFile() && /\.(tsx?|jsx?|css)$/.test(e.name)) list.push(full);
  }
}

const files = [];
walk(src, files);

const byFile = {};
for (const f of files) {
  const rel = path.relative(path.join(src, ".."), f);
  const content = fs.readFileSync(f, "utf8");
  const buttons = (content.match(/<button/g) || []).length;
  if (buttons > 0) byFile[rel] = buttons;
}

console.log("=== BUTTON AUDIT ===\n");
console.log("CSS-defined variants:", variants.length);
variants.forEach((v) => console.log("  -", v.name, "(", v.where, ")"));
console.log("\nFiles containing <button> (count):");
Object.entries(byFile)
  .sort((a, b) => b[1] - a[1])
  .forEach(([file, count]) => console.log("  ", count, file));
console.log("\nTotal raw <button> elements:", Object.values(byFile).reduce((a, b) => a + b, 0));
console.log("\nVariant summary:");
console.log("  - .btn .btn-primary: white fill, 12px radius, 48px min-height (Landing, Auth, modals)");
console.log("  - .pill / .pill--active: pill radius, gray vs white+shadow (tabs, Edit, day pickers)");
console.log("  - Inline gradient: avatar-gradient, white text (+ Day, Add schedule, Calendar month)");
console.log("  - Inline secondary: white/card bg, border (Cancel, New chat, History)");
console.log("  - Destructive: red text/border, transparent or light red bg (Delete, Terminate)");
console.log("  - Icon-only: mixed 36/40/44/56px circles, primary or ghost");
console.log("  - Landing tabs: 10px radius, active = white card");
console.log("\nApproximate distinct button STYLES in use: 10+ (inconsistent radius, fill, and active state).\n");
