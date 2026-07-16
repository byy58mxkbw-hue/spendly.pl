// Generator okładek Open Graph (1200×630 PNG) per artykuł bloga.
// URUCHAMIANY LOKALNIE (nie w buildzie Railway) — wyniki commitujemy jako statyczne
// pliki w public/blog/og/<slug>.png. Dzięki temu prod NIE potrzebuje natywnego
// rasteryzera w buildzie. Po dodaniu/zmianie tytułu artykułu: `node scripts/build-og.mjs`.

import { readFileSync, writeFileSync, readdirSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Resvg } from "@resvg/resvg-js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const CONTENT_DIR = path.join(ROOT, "content", "blog");
const OUT_DIR = path.join(ROOT, "public", "blog", "og");

const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function frontmatter(raw) {
  const m = raw.match(/^---\s*\n([\s\S]*?)\n---/);
  const meta = {};
  if (m) for (const line of m[1].split("\n")) {
    const mm = line.match(/^([a-zA-Z0-9_]+):\s*(.*)$/);
    if (mm) meta[mm[1]] = mm[2].trim().replace(/^["']|["']$/g, "");
  }
  return meta;
}

// Prosty zawijacz tekstu na linie po ~maxChars znaków (SVG nie zawija sam).
function wrap(text, maxChars) {
  const words = text.split(/\s+/);
  const lines = [];
  let cur = "";
  for (const w of words) {
    if ((cur + " " + w).trim().length > maxChars && cur) { lines.push(cur); cur = w; }
    else cur = (cur + " " + w).trim();
  }
  if (cur) lines.push(cur);
  return lines;
}

function svgFor(title, category) {
  const lines = wrap(title, 26).slice(0, 4);
  const fontSize = lines.length >= 4 ? 54 : 62;
  const lh = fontSize + 12;
  const startY = 330 - ((lines.length - 1) * lh) / 2 + 40;
  const titleTspans = lines
    .map((l, i) => `<tspan x="72" y="${startY + i * lh}">${esc(l)}</tspan>`)
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <radialGradient id="glow" cx="50%" cy="-10%" r="80%">
      <stop offset="0%" stop-color="#3DDC97" stop-opacity="0.20"/>
      <stop offset="55%" stop-color="#3DDC97" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="1200" height="630" fill="#0B0F14"/>
  <rect width="1200" height="630" fill="url(#glow)"/>
  <text x="72" y="104" font-family="Arial, sans-serif" font-size="30" font-weight="800" letter-spacing="-1">
    <tspan fill="#F5F7FA">spend</tspan><tspan fill="#3DDC97">ly.</tspan>
  </text>
  <text x="72" y="192" font-family="Arial, sans-serif" font-size="22" font-weight="800" letter-spacing="3" fill="#3DDC97">${esc((category || "Poradnik").toUpperCase())}</text>
  <text font-family="Arial, sans-serif" font-size="${fontSize}" font-weight="800" fill="#F5F7FA" letter-spacing="-1">${titleTspans}</text>
  <rect x="72" y="556" width="60" height="5" rx="2.5" fill="#3DDC97"/>
  <text x="72" y="592" font-family="Arial, sans-serif" font-size="24" fill="#9BA6B2">www.spendly.pl · blog</text>
</svg>`;
}

function render(svg, outPath) {
  const resvg = new Resvg(svg, { fitTo: { mode: "width", value: 1200 }, background: "#0B0F14" });
  writeFileSync(outPath, resvg.render().asPng());
}

function main() {
  mkdirSync(OUT_DIR, { recursive: true });
  const files = readdirSync(CONTENT_DIR).filter((f) => f.endsWith(".md"));
  for (const f of files) {
    const meta = frontmatter(readFileSync(path.join(CONTENT_DIR, f), "utf8"));
    const slug = meta.slug || f.replace(/\.md$/, "");
    render(svgFor(meta.title || slug, meta.category), path.join(OUT_DIR, `${slug}.png`));
    console.log(`  og/${slug}.png`);
  }
  // Okładka indeksu bloga.
  render(svgFor("Blog Spendly — food cost, KSeF i koszty w gastronomii", "Blog"), path.join(OUT_DIR, "_index.png"));
  console.log(`  og/_index.png`);
  console.log(`[og] wygenerowano ${files.length + 1} okładek.`);
}

main();
