// Generator bloga: Markdown (content/blog/*.md) → statyczne HTML (public/blog/*.html)
// + regeneracja public/sitemap.xml. Blog jest CZYSTO STATYCZNY (bez Reacta, bez
// /src/main.tsx) — dzięki temu nie koliduje z routingiem SPA, nie wymaga wpisów w
// rollup input, a wymuszone CSP go nie dotyka (zero inline-JS). Zero zależności npm.
//
// Uruchomienie: `node scripts/build-blog.mjs` (odpala się też automatycznie w `build`).
// Edycja artykułu = edytuj .md i przebuduj.

import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const CONTENT_DIR = path.join(ROOT, "content", "blog");
const OUT_DIR = path.join(ROOT, "public", "blog");
const SITEMAP = path.join(ROOT, "public", "sitemap.xml");
const SITE = "https://www.spendly.pl";

// ── Strony statyczne (poza blogiem) do sitemapy ─────────────────────────────
// `lastmod` MUSI odpowiadać realnej dacie zmiany treści, a nie dacie builda.
// Wcześniej każdy deploy przestawiał wszystkie strony statyczne na „dzisiaj",
// czyli przy każdej poprawce w kodzie mówiliśmy Google, że zmienił się cennik
// i strona główna. Google traktuje wtedy lastmod jako szum i przestaje mu ufać.
// Aktualizuj datę ręcznie, gdy naprawdę zmienisz treść danej strony.
const STATIC_URLS = [
  { loc: "/", changefreq: "monthly", priority: "1.0", lastmod: "2026-09-02" },
  { loc: "/ksef", changefreq: "monthly", priority: "0.8", lastmod: "2026-07-16" },
  { loc: "/food-cost", changefreq: "monthly", priority: "0.8", lastmod: "2026-07-16" },
  { loc: "/ocr-faktur", changefreq: "monthly", priority: "0.8", lastmod: "2026-07-16" },
  { loc: "/cennik", changefreq: "monthly", priority: "0.8", lastmod: "2026-09-02" },
  // Indeks bloga zmienia się realnie przy każdym nowym artykule — datę bierzemy
  // z najnowszego wpisu, więc jest prawdziwa bez ręcznego pilnowania.
  { loc: "/blog", changefreq: "weekly", priority: "0.7", lastmod: null },
  { loc: "/regulamin", changefreq: "yearly", priority: "0.3", lastmod: "2026-07-04" },
  { loc: "/polityka-prywatnosci", changefreq: "yearly", priority: "0.3", lastmod: "2026-08-28" },
];

// ── Helpers ──────────────────────────────────────────────────────────────────
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const escAttr = (s) => esc(s).replace(/"/g, "&quot;");
// JSON-LD: unikamy </script> breakout i domykamy encje
const jsonLd = (obj) => JSON.stringify(obj, null, 2).replace(/</g, "\\u003c");

function parseFrontmatter(raw) {
  const m = raw.match(/^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/);
  if (!m) return { meta: {}, body: raw };
  const meta = {};
  for (const line of m[1].split("\n")) {
    const mm = line.match(/^([a-zA-Z0-9_]+):\s*(.*)$/);
    if (mm) meta[mm[1]] = mm[2].trim().replace(/^["']|["']$/g, "");
  }
  return { meta, body: m[2] };
}

// ── Minimalny Markdown → HTML (zakres pod artykuły; treść kontrolujemy sami) ──
function inline(text) {
  let t = esc(text);
  // `kod`
  t = t.replace(/`([^`]+)`/g, (_, c) => `<code>${c}</code>`);
  // ![alt](src) — obraz z tekstem alternatywnym (przed linkami, bo składnia się pokrywa)
  t = t.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (_, alt, src) =>
    `<img src="${escAttr(src)}" alt="${escAttr(alt)}" loading="lazy" />`);
  // [tekst](url)
  t = t.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, txt, url) => {
    const ext = /^https?:\/\//.test(url) && !url.includes("spendly.pl");
    const attrs = ext ? ' target="_blank" rel="noopener noreferrer"' : "";
    return `<a href="${escAttr(url)}"${attrs}>${txt}</a>`;
  });
  // **bold**
  t = t.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  // *italic* / _italic_
  t = t.replace(/(^|[^*])\*([^*]+)\*/g, "$1<em>$2</em>");
  t = t.replace(/_([^_]+)_/g, "<em>$1</em>");
  return t;
}

function mdToHtml(md) {
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  const out = [];
  let i = 0;
  const flushList = (items, ordered) => {
    const tag = ordered ? "ol" : "ul";
    out.push(`<${tag}>${items.map((it) => `<li>${inline(it)}</li>`).join("")}</${tag}>`);
  };
  while (i < lines.length) {
    let line = lines[i];
    if (!line.trim()) { i++; continue; }
    // nagłówki
    let h = line.match(/^(#{2,4})\s+(.*)$/);
    if (h) {
      const level = h[1].length; // ## -> h2
      const id = h[2].toLowerCase().replace(/[^\p{L}\p{N}\s-]/gu, "").trim().replace(/\s+/g, "-");
      out.push(`<h${level} id="${escAttr(id)}">${inline(h[2])}</h${level}>`);
      i++; continue;
    }
    // hr
    if (/^(-{3,}|_{3,})$/.test(line.trim())) { out.push("<hr />"); i++; continue; }
    // Surowy blok HTML (np. <figure>, <svg>, <img>) — przepuszczamy bez escapowania
    // (treść autorska, zaufana). Zbieramy do pustej linii.
    if (/^\s*<(figure|svg|img|div|picture|table)\b/i.test(line)) {
      const buf = [];
      while (i < lines.length && lines[i].trim() !== "") { buf.push(lines[i]); i++; }
      out.push(buf.join("\n"));
      continue;
    }
    // blockquote
    if (/^>\s?/.test(line)) {
      const buf = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) { buf.push(lines[i].replace(/^>\s?/, "")); i++; }
      out.push(`<blockquote>${inline(buf.join(" "))}</blockquote>`);
      continue;
    }
    // tabela (| ... |)
    if (/^\|.*\|\s*$/.test(line)) {
      const rows = [];
      while (i < lines.length && /^\|.*\|\s*$/.test(lines[i])) { rows.push(lines[i]); i++; }
      const cells = (r) => r.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
      const header = cells(rows[0]);
      const bodyRows = rows.slice(2); // rows[1] = separator ---|---
      out.push(
        `<div class="table-wrap"><table><thead><tr>${header
          .map((c) => `<th>${inline(c)}</th>`)
          .join("")}</tr></thead><tbody>${bodyRows
          .map((r) => `<tr>${cells(r).map((c) => `<td>${inline(c)}</td>`).join("")}</tr>`)
          .join("")}</tbody></table></div>`,
      );
      continue;
    }
    // listy
    if (/^\s*[-*]\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) { items.push(lines[i].replace(/^\s*[-*]\s+/, "")); i++; }
      flushList(items, false);
      continue;
    }
    if (/^\s*\d+\.\s+/.test(line)) {
      const items = [];
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) { items.push(lines[i].replace(/^\s*\d+\.\s+/, "")); i++; }
      flushList(items, true);
      continue;
    }
    // paragraf (do pustej linii lub następnego bloku)
    const buf = [];
    while (
      i < lines.length &&
      lines[i].trim() &&
      !/^(#{2,4})\s/.test(lines[i]) &&
      !/^>\s?/.test(lines[i]) &&
      !/^\s*[-*]\s+/.test(lines[i]) &&
      !/^\s*\d+\.\s+/.test(lines[i]) &&
      !/^\|.*\|\s*$/.test(lines[i]) &&
      !/^(-{3,}|_{3,})$/.test(lines[i].trim())
    ) { buf.push(lines[i]); i++; }
    out.push(`<p>${inline(buf.join(" "))}</p>`);
  }
  return out.join("\n");
}

function readingTime(md) {
  const words = md.replace(/[#>*`\-|]/g, " ").split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 200));
}

function plDate(iso) {
  try {
    return new Date(iso).toLocaleDateString("pl-PL", { day: "numeric", month: "long", year: "numeric" });
  } catch { return iso; }
}

// ── Wspólne kawałki layoutu (jasny domyślnie, spójne z index.html/ksef.html) ──
// Analityka na statycznych stronach bloga. Do tej pory blog nie ładował nic poza
// JSON-LD, więc ruch z 16 artykułów SEO w ogóle nie był mierzony — w PostHogu
// widać było tylko wejścia z SPA. Zasady te same co w `src/lib/posthog.ts`:
// start OPT-OUT, zbieranie dopiero po zgodzie `statistics` z Cookiebota (RODO).
// Klucz jest publiczny (write-only ingest), więc może być w statycznym HTML.
// CSP: eu-assets.i.posthog.com (script) i eu.i.posthog.com (connect) są już
// na whiteliście, a inline-skrypty hashuje `collectInlineScriptHashes` (reguła 28).
const PH_KEY = process.env.VITE_POSTHOG_KEY || "phc_kZJThuLvVBkGJ9uSSzBQ9j8Uc94EKvJGZHFHxUSAfkbn";
const PH_HOST = process.env.VITE_POSTHOG_HOST || "https://eu.i.posthog.com";

const ANALYTICS = `
    <script id="Cookiebot" src="https://consent.cookiebot.com/uc.js" data-cbid="e40f250c-7bc6-4347-8e61-e312f6f4fca5" data-blockingmode="manual" type="text/javascript" async></script>
    <script>
      !function(){var t=window;t.posthog=t.posthog||[];
      var s=document.createElement("script");s.type="text/javascript";s.async=!0;
      s.src="${PH_HOST.replace("eu.i.", "eu-assets.i.")}/static/array.js";
      s.onload=function(){
        posthog.init("${PH_KEY}",{api_host:"${PH_HOST}",ui_host:"https://eu.posthog.com",person_profiles:"identified_only",opt_out_capturing_by_default:!0});
        var sync=function(){
          if(window.Cookiebot&&window.Cookiebot.consent&&window.Cookiebot.consent.statistics)posthog.opt_in_capturing();
          else posthog.opt_out_capturing();
        };
        if(window.Cookiebot&&window.Cookiebot.consent)sync();
        window.addEventListener("CookiebotOnConsentReady",sync);
        window.addEventListener("CookiebotOnAccept",sync);
        window.addEventListener("CookiebotOnDecline",sync);
      };
      document.head.appendChild(s);}();
    </script>`;

const HEAD_COMMON = `
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
    <meta name="theme-color" content="#A8431F" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
    <link rel="preload" href="/fonts/inter-latin.woff2" as="font" type="font/woff2" crossorigin>
    <link rel="preload" href="/fonts/inter-latin-ext.woff2" as="font" type="font/woff2" crossorigin>${ANALYTICS}`;

const STYLE = `
    <style>
      /* Fonty marki na STABILNYCH ścieżkach — blog jest statyczny i nie widzi
         hashowanych assetów Vite. Kopie leżą w public/fonts (patrz README/CLAUDE.md).
         Audyt brandingowy 2026-09: Inter (body) + Baloo 2 (nagłówki), zgodnie z
         resztą publicznej strony marketingowej — Space Grotesk zostaje w panelu. */
      @font-face{font-family:'Inter Variable';font-style:normal;font-weight:100 900;font-display:swap;src:url('/fonts/inter-latin.woff2') format('woff2-variations');unicode-range:U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD}
      @font-face{font-family:'Inter Variable';font-style:normal;font-weight:100 900;font-display:swap;src:url('/fonts/inter-latin-ext.woff2') format('woff2-variations');unicode-range:U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF}
      @font-face{font-family:'Baloo 2 Variable';font-style:normal;font-weight:400 800;font-display:swap;src:url('/fonts/baloo-2-latin.woff2') format('woff2-variations');unicode-range:U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD}
      @font-face{font-family:'Baloo 2 Variable';font-style:normal;font-weight:400 800;font-display:swap;src:url('/fonts/baloo-2-latin-ext.woff2') format('woff2-variations');unicode-range:U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF}
      *{box-sizing:border-box}
      html,body{margin:0;padding:0}
      body{background:#F4EDE0;color:#211B12;font-family:'Inter Variable',system-ui,-apple-system,sans-serif;line-height:1.6;-webkit-font-smoothing:antialiased}
      a{color:#A8431F}
      .wrap{max-width:1200px;margin:0 auto;padding:0 24px}
      header.nav{position:sticky;top:0;z-index:50;background:#F4EDE0;border-bottom:1px solid #E2D8C6}
      header.nav .row{display:flex;align-items:center;justify-content:space-between;height:60px}
      .brand{font-size:18px;font-weight:700;letter-spacing:-0.03em;color:#A8431F;text-decoration:none}
      .brand span{color:#211B12}
      .nav-links{display:flex;gap:24px;align-items:center}
      .nav-links a{color:#8A7C63;text-decoration:none;font-size:13px}
      .nav-links a:hover{color:#211B12}
      .nav-cta{padding:7px 16px;border-radius:3px;font-size:13px;font-weight:600;background:#A8431F;color:#FFFFFF !important;text-decoration:none}
      @media(max-width:720px){.nav-links .hide-sm{display:none}}
      main{display:block}
      .crumbs{font-size:12px;color:rgba(33,27,18,.60);padding:20px 0 0}
      .crumbs a{color:#8A7C63;text-decoration:none}
      article.post{max-width:760px;margin:0 auto;padding:8px 24px 40px}
      article.post h1{font-family:'Baloo 2 Variable',system-ui,sans-serif;font-size:clamp(1.9rem,4.5vw,2.9rem);font-weight:600;letter-spacing:0;line-height:1.12;margin:20px 0 14px;color:#211B12}
      .post-meta{font-size:13px;color:#8A7C63;margin-bottom:8px;display:flex;gap:14px;flex-wrap:wrap}
      .lead{font-size:18px;color:#211B12;line-height:1.65;margin:0 0 8px}
      .post-body{font-size:16px;color:#211B12;line-height:1.8}
      .post-body h2{font-family:'Baloo 2 Variable',system-ui,sans-serif;font-size:1.55rem;font-weight:600;color:#211B12;letter-spacing:0;margin:44px 0 14px;line-height:1.25}
      .post-body h3{font-family:'Baloo 2 Variable',system-ui,sans-serif;font-size:1.18rem;font-weight:600;color:#211B12;margin:32px 0 10px}
      .post-body p{margin:0 0 18px}
      .post-body ul,.post-body ol{margin:0 0 18px;padding-left:22px}
      .post-body li{margin:0 0 8px}
      .post-body strong{color:#211B12}
      .post-body a{text-decoration:underline;text-underline-offset:2px}
      .post-body code{background:#E2D8C6;border:1px solid #E2D8C6;border-radius:3px;padding:1px 6px;font-size:0.9em;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;color:#A8431F}
      .post-body blockquote{margin:24px 0;padding:16px 20px;border-left:3px solid #A8431F;background:#EFE0C6;border-radius:0;color:#5C5340}
      .post-body blockquote p{margin:0}
      .post-body hr{border:0;border-top:1px solid #E2D8C6;margin:32px 0}
      .table-wrap{overflow-x:auto;margin:0 0 22px}
      .post-body figure{margin:26px 0}
      .post-body img{max-width:100%;height:auto;border-radius:4px;border:1px solid #E2D8C6;display:block}
      .post-body figcaption{font-size:13px;color:#8A7C63;margin-top:10px;text-align:center}
      .post-body figure.diagram{background:#FBF7EF;border:1px solid #E2D8C6;border-radius:4px;padding:22px 20px}
      .post-body figure.diagram svg{max-width:100%;height:auto;display:block;margin:0 auto}
      .post-body figure.diagram img{border:0}
      .post-body table{border-collapse:collapse;width:100%;font-size:14px}
      .post-body th,.post-body td{border:1px solid #E2D8C6;padding:10px 12px;text-align:left}
      .post-body th{background:#E2D8C6;color:#211B12;font-weight:600}
      .cta-box{max-width:760px;margin:8px auto 0;padding:0 24px}
      .cta-inner{background:#FBF7EF;border:1px solid #E2D8C6;border-radius:4px;padding:32px 28px;text-align:center}
      .cta-inner h2{font-family:'Baloo 2 Variable',system-ui,sans-serif;font-size:1.45rem;font-weight:600;letter-spacing:0;color:#211B12;margin:0 0 10px}
      .cta-inner p{color:#8A7C63;margin:0 0 20px;font-size:14px}
      .btn{display:inline-flex;align-items:center;gap:8px;padding:13px 26px;border-radius:4px;font-size:14px;font-weight:700;background:#A8431F;color:#FFFFFF;text-decoration:none}
      .related{max-width:760px;margin:48px auto 0;padding:0 24px}
      .related h2{font-family:'Baloo 2 Variable',system-ui,sans-serif;font-size:1.1rem;font-weight:600;letter-spacing:0;color:#211B12;margin:0 0 16px}
      .related-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:14px}
      .related-grid a{display:block;background:#FBF7EF;border:1px solid #E2D8C6;border-radius:4px;padding:16px 18px;text-decoration:none}
      .related-grid a:hover{border-color:rgba(168,67,31,0.35)}
      .related-grid .t{color:#211B12;font-size:14px;font-weight:600;line-height:1.35}
      .related-grid .d{color:#8A7C63;font-size:12px;margin-top:6px}
      footer.ft{border-top:1px solid #E2D8C6;padding:40px 24px;margin-top:56px}
      footer.ft .cols{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:32px;margin-bottom:28px}
      footer.ft p.h{font-size:11px;font-weight:700;color:#8A7C63;text-transform:uppercase;letter-spacing:0.08em;margin:0 0 12px}
      footer.ft .col a{display:block;font-size:13px;color:#8A7C63;text-decoration:none;margin-bottom:8px}
      footer.ft .bottom{padding-top:20px;border-top:1px solid #E2D8C6;display:flex;flex-wrap:wrap;gap:8px 20px;align-items:center;justify-content:center;font-size:12px;color:#8A7C63}
      footer.ft .bottom a{color:#8A7C63;text-decoration:none}
      /* Blog index */
      .hero{max-width:1200px;margin:0 auto;padding:64px 24px 32px}
      .hero h1{font-family:'Baloo 2 Variable',system-ui,sans-serif;font-size:clamp(2rem,5vw,3rem);font-weight:600;letter-spacing:0;margin:0 0 14px;color:#211B12}
      .hero p{font-size:17px;color:#8A7C63;max-width:640px;line-height:1.65;margin:0}
      .posts{max-width:1200px;margin:0 auto;padding:24px 24px 24px;display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:20px}
      .card{background:#FBF7EF;border:1px solid #E2D8C6;border-radius:4px;padding:26px 24px;text-decoration:none;display:flex;flex-direction:column}
      .card:hover{border-color:rgba(168,67,31,0.35)}
      .card .k{font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#A8431F;margin-bottom:12px}
      .card h2{font-family:'Baloo 2 Variable',system-ui,sans-serif;font-size:1.18rem;font-weight:600;color:#211B12;line-height:1.3;margin:0 0 10px;letter-spacing:0}
      .card p{font-size:14px;color:#8A7C63;line-height:1.6;margin:0 0 16px;flex:1}
      .card .m{font-size:12px;color:rgba(33,27,18,.60)}
    </style>`;

// Wordmark SVG — te same ścieżki co components/logo.tsx (audyt brandingowy
// 2026-09). Blog jest statyczny (bez Reacta), więc markup jest tu zduplikowany
// jako string zamiast importu komponentu — jedyne miejsce w projekcie, gdzie
// wordmark NIE korzysta z components/logo.tsx, bo generator nie renderuje JSX.
const WORDMARK_PATHS_TEXT = `<path d="M279 -13Q210 -13 151.5 0.5Q93 14 58.0 43.5Q23 73 23 122Q23 165 49.0 193.0Q75 221 118 221Q145 221 172.5 212.5Q200 204 231.0 196.0Q262 188 298 188Q330 188 341.0 191.5Q352 195 352 205Q352 217 338.5 221.0Q325 225 293 231L221 245Q176 254 133.5 268.5Q91 283 63.5 312.0Q36 341 36 391Q36 459 96.5 497.0Q157 535 272 535Q338 535 390.5 522.0Q443 509 474.0 483.5Q505 458 505 420Q506 379 483.0 354.0Q460 329 425 329Q400 329 374.5 335.5Q349 342 319.5 349.5Q290 357 252 358Q225 360 208.0 355.0Q191 350 191 339Q191 327 211.0 322.5Q231 318 271 311L342 298Q407 287 445.5 270.5Q484 254 501.0 225.0Q518 196 518 145Q518 92 487.5 56.5Q457 21 403.0 4.0Q349 -13 279 -13Z" transform="translate(0,0)"/><path d="M381 0Q326 0 289.5 34.0Q253 68 243 122H225V-108Q225 -149 202.0 -177.5Q179 -206 132 -206Q87 -206 62.5 -177.5Q38 -149 38 -106V268Q38 318 34.5 352.5Q31 387 28 415Q24 457 45.0 486.5Q66 516 113 522Q174 530 199.5 500.5Q225 471 225 409V361L229 360Q234 399 252.5 436.5Q271 474 305.0 498.5Q339 523 391 523Q478 523 520.5 453.5Q563 384 563 268Q563 0 381 0ZM221 270Q221 254 225 245Q231 226 250.5 217.5Q270 209 309 209Q359 209 377.5 224.0Q396 239 396 270Q396 302 378.0 316.5Q360 331 310 331Q270 331 250.5 322.5Q231 314 225 295Q221 286 221 270Z" transform="translate(540,0)"/><path d="M23 260Q23 339 54.5 399.0Q86 459 144.5 493.0Q203 527 284 527Q347 527 397.5 504.0Q448 481 477.0 442.5Q506 404 506 358Q506 310 478.0 290.0Q450 270 395 270H185Q185 244 205.5 227.0Q226 210 275 210Q300 210 321.5 215.0Q343 220 365.5 224.5Q388 229 416 229Q456 229 482.0 200.5Q508 172 508 122Q508 63 447.5 30.0Q387 -3 289 -3Q220 -3 159.5 24.0Q99 51 61.0 109.5Q23 168 23 260ZM347 303Q362 303 357 317Q353 331 333.0 346.0Q313 361 275 361Q231 361 209.5 342.0Q188 323 188 303Z" transform="translate(1126,0)"/><path d="M124 0Q80 0 53.5 26.5Q27 53 27 92V423Q27 465 52.0 494.0Q77 523 124 523Q170 523 194.0 494.0Q218 465 218 421V371H236Q236 428 256.5 461.0Q277 494 309.0 508.5Q341 523 373 523Q450 523 486.0 467.5Q522 412 522 310V92Q522 53 496.0 26.5Q470 0 426 0Q381 0 354.5 26.5Q328 53 328 92V269Q328 305 314.5 325.0Q301 345 275 345Q245 345 231.5 323.0Q218 301 218 267V92Q218 53 193.0 26.5Q168 0 124 0Z" transform="translate(1652,0)"/><path d="M205 0Q23 0 23 268Q23 384 68.0 453.5Q113 523 203 523Q252 523 282.5 503.0Q313 483 330.5 448.5Q348 414 356 369L359 370V673Q359 714 383.5 742.5Q408 771 455 771Q501 771 523.5 742.5Q546 714 546 671V221Q546 187 551.5 158.5Q557 130 560 102Q563 64 544.5 36.5Q526 9 479 1Q418 -9 388.5 22.0Q359 53 359 114V151H340Q340 78 303.5 39.0Q267 0 205 0ZM190 277Q190 246 209.0 231.0Q228 216 277 216Q327 216 346.0 231.0Q365 246 365 277Q365 309 346.5 323.5Q328 338 278 338Q228 338 209.0 323.5Q190 309 190 277Z" transform="translate(2199,0)"/>`;
const WORDMARK_PATHS_ACCENT = `<path d="M121 0Q72 0 47.5 26.0Q23 52 23 91V671Q23 714 47.5 742.5Q72 771 121 771Q165 771 189.0 742.5Q213 714 213 673V91Q213 52 189.0 26.0Q165 0 121 0Z" transform="translate(2780,0)"/><path d="M221 -206Q154 -206 111.5 -184.0Q69 -162 45 -126Q25 -95 22.5 -61.0Q20 -27 35.0 2.5Q50 32 80 48Q111 65 142.0 61.5Q173 58 199.0 38.5Q225 19 239 -12Q254 -45 269.5 -60.5Q285 -76 310 -67Q334 -59 327.5 -23.0Q321 13 301 62H264Q221 62 178.0 93.0Q135 124 106 191L24 381Q5 426 20.5 464.0Q36 502 77 519Q115 536 152.0 521.0Q189 506 210 457L286 280Q305 237 327.5 218.0Q350 199 375 212Q397 224 399.0 245.5Q401 267 378 298Q368 312 354.5 329.0Q341 346 330.5 368.5Q320 391 320 419Q320 466 352.0 496.5Q384 527 436 527Q483 527 511.5 497.0Q540 467 540 419Q540 385 532.0 344.0Q524 303 514 268L442 5Q426 -54 400.0 -102.0Q374 -150 331.0 -178.0Q288 -206 221 -206Z" transform="translate(3016,0)"/><path d="M150 -19Q91 -19 58.0 12.5Q25 44 25 96Q25 149 59.0 182.0Q93 215 150 215Q206 215 239.5 182.5Q273 150 273 97Q273 45 241.0 13.0Q209 -19 150 -19Z" transform="translate(3570,0)"/>`;
const wordmarkSvg = (h) => {
  const w = (h * (1267.4 / 360)).toFixed(1);
  return `<svg viewBox="0 0 1267.4 360.0" width="${w}" height="${h}" role="img" aria-label="spendly." style="display:block"><g fill="#211B12" transform="translate(40.00,266.75) scale(0.30706,-0.30706)">${WORDMARK_PATHS_TEXT}</g><g fill="#A8431F" transform="translate(40.00,266.75) scale(0.30706,-0.30706)">${WORDMARK_PATHS_ACCENT}</g></svg>`;
};

const nav = () => `
    <header class="nav"><div class="wrap row">
      <a class="brand" href="/" aria-label="Spendly" style="display:inline-flex;line-height:0;">${wordmarkSvg(20)}</a>
      <nav class="nav-links" aria-label="Nawigacja główna">
        <a href="/blog">Blog</a>
        <a class="hide-sm" href="/ksef">KSeF</a>
        <a class="hide-sm" href="/food-cost">Food cost</a>
        <a class="hide-sm" href="/cennik">Cennik</a>
        <a class="nav-cta" href="/sign-up">Wypróbuj za darmo</a>
      </nav>
    </div></header>`;

const footer = () => `
    <footer class="ft"><div class="wrap">
      <div class="cols">
        <div>
          ${wordmarkSvg(16)}
          <p style="font-size:12px;color:#8A7C63;margin-top:8px;line-height:1.6;max-width:220px;">Kontrola kosztów restauracji z integracją KSeF i OCR faktur.</p>
        </div>
        <nav class="col" aria-label="Rozwiązania">
          <p class="h">Rozwiązania</p>
          <a href="/ksef">Integracja KSeF</a>
          <a href="/food-cost">Kontrola food cost</a>
          <a href="/ocr-faktur">OCR faktur</a>
        </nav>
        <nav class="col" aria-label="Zasoby">
          <p class="h">Zasoby</p>
          <a href="/blog">Blog</a>
          <a href="/cennik">Cennik</a>
          <a href="/sign-up">Rejestracja</a>
          <a href="mailto:kontakt@spendly.pl">Kontakt</a>
        </nav>
      </div>
      <div class="bottom">
        <span>&copy; 2026 SPENDLY. Wszelkie prawa zastrzeżone.</span>
        <a href="/polityka-prywatnosci">Polityka prywatności</a>
        <a href="/regulamin">Regulamin</a>
      </div>
    </div></footer>`;

// ── Render pojedynczego artykułu ─────────────────────────────────────────────
function renderPost(post, related) {
  const url = `${SITE}/blog/${post.slug}`;
  const bodyHtml = mdToHtml(post.body);
  const rt = readingTime(post.body);
  const blogPosting = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: post.meta.title,
    description: post.meta.description,
    image: [`${SITE}/blog/og/${post.slug}.png`],
    datePublished: post.meta.date,
    dateModified: post.meta.updated || post.meta.date,
    inLanguage: "pl-PL",
    mainEntityOfPage: { "@type": "WebPage", "@id": url },
    author: { "@type": "Organization", name: "Spendly", url: SITE },
    publisher: {
      "@type": "Organization",
      name: "Spendly",
      url: SITE,
      logo: { "@type": "ImageObject", url: `${SITE}/favicon.svg` },
    },
    ...(post.meta.keywords ? { keywords: post.meta.keywords } : {}),
  };
  const breadcrumb = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Strona główna", item: `${SITE}/` },
      { "@type": "ListItem", position: 2, name: "Blog", item: `${SITE}/blog` },
      { "@type": "ListItem", position: 3, name: post.meta.title, item: url },
    ],
  };
  const relatedHtml = related.length
    ? `<section class="related"><h2>Zobacz też</h2><div class="related-grid">${related
        .map(
          (r) =>
            `<a href="/blog/${r.slug}"><span class="t">${esc(r.meta.title)}</span><span class="d">${plDate(r.meta.date)}</span></a>`,
        )
        .join("")}</div></section>`
    : "";

  return `<!DOCTYPE html>
<html lang="pl" class="light">
  <head>${HEAD_COMMON}
    <title>${esc(post.meta.title)} | Spendly</title>
    <meta name="description" content="${escAttr(post.meta.description)}" />
    ${post.meta.keywords ? `<meta name="keywords" content="${escAttr(post.meta.keywords)}" />` : ""}
    <meta name="robots" content="index, follow" />
    <link rel="canonical" href="${url}" />
    <meta property="og:type" content="article" />
    <meta property="og:url" content="${url}" />
    <meta property="og:title" content="${escAttr(post.meta.title)}" />
    <meta property="og:description" content="${escAttr(post.meta.description)}" />
    <meta property="og:site_name" content="Spendly" />
    <meta property="og:locale" content="pl_PL" />
    <meta property="og:image" content="${SITE}/blog/og/${post.slug}.png" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="article:published_time" content="${escAttr(post.meta.date)}" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="${escAttr(post.meta.title)}" />
    <meta name="twitter:description" content="${escAttr(post.meta.description)}" />
    <meta name="twitter:image" content="${SITE}/blog/og/${post.slug}.png" />
    <script type="application/ld+json">
${jsonLd(blogPosting)}
    </script>
    <script type="application/ld+json">
${jsonLd(breadcrumb)}
    </script>${STYLE}
  </head>
  <body>
${nav()}
    <main>
      <div class="wrap crumbs"><a href="/">Strona główna</a> › <a href="/blog">Blog</a> › ${esc(post.meta.title)}</div>
      <article class="post">
        <h1>${esc(post.meta.h1 || post.meta.title)}</h1>
        <div class="post-meta"><span>${plDate(post.meta.date)}</span><span>${rt} min czytania</span></div>
        ${post.meta.lead ? `<p class="lead">${inline(post.meta.lead)}</p>` : ""}
        <div class="post-body">
${bodyHtml}
        </div>
      </article>
      <div class="cta-box"><div class="cta-inner">
        <h2>Policz food cost automatycznie z Spendly</h2>
        <p>Faktury z KSeF, OCR paragonów i alerty cenowe w jednym miejscu. Okres testowy — bezpłatnie.</p>
        <a class="btn" href="/sign-up">Rozpocznij za darmo</a>
      </div></div>
      ${relatedHtml}
    </main>
${footer()}
  </body>
</html>
`;
}

// ── Render indeksu bloga ─────────────────────────────────────────────────────
function renderIndex(posts) {
  const cards = posts
    .map(
      (p) => `
      <a class="card" href="/blog/${p.slug}">
        <span class="k">${esc(p.meta.category || "Poradnik")}</span>
        <h2>${esc(p.meta.title)}</h2>
        <p>${esc(p.meta.description)}</p>
        <span class="m">${plDate(p.meta.date)} · ${readingTime(p.body)} min czytania</span>
      </a>`,
    )
    .join("");

  const blogLd = {
    "@context": "https://schema.org",
    "@type": "Blog",
    name: "Blog Spendly",
    url: `${SITE}/blog`,
    description:
      "Poradniki o food cost, kontroli kosztów restauracji, KSeF i analizie faktur dla gastronomii.",
    inLanguage: "pl-PL",
    blogPost: posts.map((p) => ({
      "@type": "BlogPosting",
      headline: p.meta.title,
      description: p.meta.description,
      datePublished: p.meta.date,
      url: `${SITE}/blog/${p.slug}`,
    })),
  };
  const breadcrumb = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Strona główna", item: `${SITE}/` },
      { "@type": "ListItem", position: 2, name: "Blog", item: `${SITE}/blog` },
    ],
  };

  return `<!DOCTYPE html>
<html lang="pl" class="light">
  <head>${HEAD_COMMON}
    <title>Blog Spendly — food cost, KSeF i kontrola kosztów w gastronomii</title>
    <meta name="description" content="Praktyczne poradniki dla restauracji: jak liczyć food cost, ile powinien wynosić, KSeF dla gastronomii i automatyzacja faktur. Wiedza od twórców Spendly." />
    <meta name="keywords" content="food cost, food cost restauracja, jak liczyć food cost, KSeF restauracja, kontrola kosztów gastronomia, blog gastronomiczny" />
    <meta name="robots" content="index, follow" />
    <link rel="canonical" href="${SITE}/blog" />
    <meta property="og:type" content="website" />
    <meta property="og:url" content="${SITE}/blog" />
    <meta property="og:title" content="Blog Spendly — food cost, KSeF i kontrola kosztów w gastronomii" />
    <meta property="og:description" content="Praktyczne poradniki dla restauracji: food cost, KSeF, automatyzacja faktur." />
    <meta property="og:site_name" content="Spendly" />
    <meta property="og:locale" content="pl_PL" />
    <meta property="og:image" content="${SITE}/blog/og/_index.png" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="Blog Spendly — food cost, KSeF i kontrola kosztów" />
    <meta name="twitter:image" content="${SITE}/blog/og/_index.png" />
    <script type="application/ld+json">
${jsonLd(blogLd)}
    </script>
    <script type="application/ld+json">
${jsonLd(breadcrumb)}
    </script>${STYLE}
  </head>
  <body>
${nav()}
    <main>
      <div class="wrap crumbs"><a href="/">Strona główna</a> › Blog</div>
      <section class="hero">
        <h1>Blog Spendly</h1>
        <p>Praktyczna wiedza o food cost, kontroli kosztów restauracji, KSeF i automatyzacji faktur — od zespołu, który buduje narzędzie dla gastronomii.</p>
      </section>
      <section class="posts">${cards}
      </section>
    </main>
${footer()}
  </body>
</html>
`;
}

// ── Sitemap ──────────────────────────────────────────────────────────────────
function writeSitemap(posts) {
  const today = new Date().toISOString().slice(0, 10);
  // Najnowsza data publikacji/aktualizacji artykułu — dla indeksu bloga.
  const newestPost = posts
    .map((p) => p.meta.updated || p.meta.date)
    .filter(Boolean)
    .sort()
    .pop();
  const urls = [
    ...STATIC_URLS.map((u) => ({ ...u, lastmod: u.lastmod ?? newestPost ?? today })),
    ...posts.map((p) => ({
      loc: `/blog/${p.slug}`,
      changefreq: "monthly",
      priority: "0.6",
      lastmod: p.meta.updated || p.meta.date || today,
    })),
  ];
  const xml =
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    urls
      .map(
        (u) =>
          `  <url>\n    <loc>${SITE}${u.loc}</loc>\n    <lastmod>${u.lastmod}</lastmod>\n    <changefreq>${u.changefreq}</changefreq>\n    <priority>${u.priority}</priority>\n  </url>`,
      )
      .join("\n") +
    `\n</urlset>\n`;
  writeFileSync(SITEMAP, xml, "utf8");
}

// ── Main ─────────────────────────────────────────────────────────────────────
function main() {
  if (!existsSync(CONTENT_DIR)) {
    console.warn(`[blog] brak katalogu ${CONTENT_DIR} — pomijam.`);
    return;
  }
  mkdirSync(OUT_DIR, { recursive: true });

  const files = readdirSync(CONTENT_DIR).filter((f) => f.endsWith(".md"));
  const posts = files.map((f) => {
    const raw = readFileSync(path.join(CONTENT_DIR, f), "utf8");
    const { meta, body } = parseFrontmatter(raw);
    return { slug: meta.slug || f.replace(/\.md$/, ""), meta, body };
  });
  // najnowsze pierwsze
  posts.sort((a, b) => String(b.meta.date).localeCompare(String(a.meta.date)));

  for (const post of posts) {
    const related = posts.filter((p) => p.slug !== post.slug).slice(0, 3);
    writeFileSync(path.join(OUT_DIR, `${post.slug}.html`), renderPost(post, related), "utf8");
  }
  // Index jako public/blog.html (NIE blog/index.html): sirv z SPA-fallbackiem na
  // prodzie serwuje bezrozszerzeniowe /blog przez rozszerzenie (.html), tak jak
  // /ksef → ksef.html. Katalog-index (blog/index.html) łapał się tylko lokalnie.
  writeFileSync(path.join(ROOT, "public", "blog.html"), renderIndex(posts), "utf8");
  writeSitemap(posts);

  console.log(`[blog] wygenerowano ${posts.length} artykuł(ów) + index + sitemap.`);
  for (const p of posts) console.log(`  /blog/${p.slug}`);
}

main();
