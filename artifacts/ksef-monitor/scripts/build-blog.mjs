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
const STATIC_URLS = [
  { loc: "/", changefreq: "monthly", priority: "1.0" },
  { loc: "/ksef", changefreq: "monthly", priority: "0.8" },
  { loc: "/food-cost", changefreq: "monthly", priority: "0.8" },
  { loc: "/ocr-faktur", changefreq: "monthly", priority: "0.8" },
  { loc: "/cennik", changefreq: "monthly", priority: "0.8" },
  { loc: "/blog", changefreq: "weekly", priority: "0.7" },
  { loc: "/regulamin", changefreq: "yearly", priority: "0.3" },
  { loc: "/polityka-prywatnosci", changefreq: "yearly", priority: "0.3" },
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

// ── Wspólne kawałki layoutu (dark, spójne z ksef.html) ───────────────────────
const HEAD_COMMON = `
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
    <meta name="theme-color" content="#3DDC97" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
    <link rel="preload" href="/fonts/inter-latin.woff2" as="font" type="font/woff2" crossorigin>`;

const STYLE = `
    <style>
      @font-face{font-family:'Inter';font-style:normal;font-weight:100 900;font-display:swap;src:url('/fonts/inter-latin.woff2') format('woff2');unicode-range:U+0000-00FF,U+0131,U+0152-0153,U+2000-206F,U+2074,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD}
      @font-face{font-family:'Inter';font-style:normal;font-weight:100 900;font-display:swap;src:url('/fonts/inter-latin-ext.woff2') format('woff2');unicode-range:U+0100-024F,U+0259,U+1E00-1EFF,U+2020,U+20A0-20AB,U+20AD-20CF,U+2113,U+2C60-2C7F,U+A720-A7FF}
      *{box-sizing:border-box}
      html,body{margin:0;padding:0}
      body{background:radial-gradient(ellipse 90% 55% at 50% -8%, rgba(61,220,151,0.10), transparent 60%), #0B0F14;color:#F5F7FA;font-family:'Inter',system-ui,-apple-system,sans-serif;line-height:1.6;-webkit-font-smoothing:antialiased}
      a{color:#3DDC97}
      .wrap{max-width:1200px;margin:0 auto;padding:0 24px}
      header.nav{position:sticky;top:0;z-index:50;background:rgba(11,15,20,0.9);backdrop-filter:blur(18px);border-bottom:1px solid rgba(255,255,255,0.08)}
      header.nav .row{display:flex;align-items:center;justify-content:space-between;height:60px}
      .brand{font-size:18px;font-weight:900;letter-spacing:-0.04em;color:#3DDC97;text-decoration:none}
      .brand span{color:#F5F7FA}
      .nav-links{display:flex;gap:24px;align-items:center}
      .nav-links a{color:#9BA6B2;text-decoration:none;font-size:13px}
      .nav-links a:hover{color:#F5F7FA}
      .nav-cta{padding:7px 16px;border-radius:8px;font-size:13px;font-weight:600;background:#3DDC97;color:#0B0F14 !important;text-decoration:none}
      @media(max-width:720px){.nav-links .hide-sm{display:none}}
      main{display:block}
      .crumbs{font-size:12px;color:#6b7683;padding:20px 0 0}
      .crumbs a{color:#9BA6B2;text-decoration:none}
      article.post{max-width:760px;margin:0 auto;padding:8px 24px 40px}
      article.post h1{font-size:clamp(1.9rem,4.5vw,2.9rem);font-weight:700;letter-spacing:-0.03em;line-height:1.12;margin:20px 0 14px}
      .post-meta{font-size:13px;color:#6b7683;margin-bottom:8px;display:flex;gap:14px;flex-wrap:wrap}
      .lead{font-size:18px;color:#c3cbd4;line-height:1.65;margin:0 0 8px}
      .post-body{font-size:16px;color:#c3cbd4;line-height:1.8}
      .post-body h2{font-size:1.5rem;font-weight:600;color:#F5F7FA;letter-spacing:-0.02em;margin:44px 0 14px;line-height:1.25}
      .post-body h3{font-size:1.15rem;font-weight:600;color:#F5F7FA;margin:32px 0 10px}
      .post-body p{margin:0 0 18px}
      .post-body ul,.post-body ol{margin:0 0 18px;padding-left:22px}
      .post-body li{margin:0 0 8px}
      .post-body strong{color:#F5F7FA}
      .post-body a{text-decoration:underline;text-underline-offset:2px}
      .post-body code{background:rgba(255,255,255,0.07);border:1px solid rgba(255,255,255,0.08);border-radius:6px;padding:1px 6px;font-size:0.9em;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;color:#8ff0c8}
      .post-body blockquote{margin:24px 0;padding:16px 20px;border-left:3px solid #3DDC97;background:rgba(61,220,151,0.06);border-radius:0 12px 12px 0;color:#d6dde4}
      .post-body blockquote p{margin:0}
      .post-body hr{border:0;border-top:1px solid rgba(255,255,255,0.08);margin:32px 0}
      .table-wrap{overflow-x:auto;margin:0 0 22px}
      .post-body figure{margin:26px 0}
      .post-body img{max-width:100%;height:auto;border-radius:12px;border:1px solid rgba(255,255,255,0.08);display:block}
      .post-body figcaption{font-size:13px;color:#6b7683;margin-top:10px;text-align:center}
      .post-body figure.diagram{background:#0f151c;border:1px solid rgba(255,255,255,0.08);border-radius:14px;padding:22px 20px}
      .post-body figure.diagram svg{max-width:100%;height:auto;display:block;margin:0 auto}
      .post-body figure.diagram img{border:0}
      .post-body table{border-collapse:collapse;width:100%;font-size:14px}
      .post-body th,.post-body td{border:1px solid rgba(255,255,255,0.10);padding:10px 12px;text-align:left}
      .post-body th{background:rgba(255,255,255,0.04);color:#F5F7FA;font-weight:600}
      .cta-box{max-width:760px;margin:8px auto 0;padding:0 24px}
      .cta-inner{background:linear-gradient(135deg,rgba(61,220,151,0.12) 0%,rgba(61,220,151,0.04) 100%);border:1px solid rgba(61,220,151,0.2);border-radius:20px;padding:32px 28px;text-align:center}
      .cta-inner h2{font-size:1.4rem;font-weight:600;color:#F5F7FA;margin:0 0 10px}
      .cta-inner p{color:#9BA6B2;margin:0 0 20px;font-size:14px}
      .btn{display:inline-flex;align-items:center;gap:8px;padding:13px 26px;border-radius:11px;font-size:14px;font-weight:700;background:#3DDC97;color:#0B0F14;text-decoration:none}
      .related{max-width:760px;margin:48px auto 0;padding:0 24px}
      .related h2{font-size:1.1rem;color:#F5F7FA;margin:0 0 16px}
      .related-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:14px}
      .related-grid a{display:block;background:#131A22;border:1px solid rgba(255,255,255,0.08);border-radius:14px;padding:16px 18px;text-decoration:none}
      .related-grid a:hover{border-color:rgba(61,220,151,0.3)}
      .related-grid .t{color:#F5F7FA;font-size:14px;font-weight:600;line-height:1.35}
      .related-grid .d{color:#6b7683;font-size:12px;margin-top:6px}
      footer.ft{border-top:1px solid rgba(255,255,255,0.08);padding:40px 24px;margin-top:56px}
      footer.ft .cols{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:32px;margin-bottom:28px}
      footer.ft p.h{font-size:11px;font-weight:700;color:#9BA6B2;text-transform:uppercase;letter-spacing:0.08em;margin:0 0 12px}
      footer.ft .col a{display:block;font-size:13px;color:#9BA6B2;text-decoration:none;margin-bottom:8px}
      footer.ft .bottom{padding-top:20px;border-top:1px solid rgba(255,255,255,0.08);display:flex;flex-wrap:wrap;gap:8px 20px;align-items:center;justify-content:center;font-size:12px;color:#9BA6B2}
      footer.ft .bottom a{color:#9BA6B2;text-decoration:none}
      /* Blog index */
      .hero{max-width:1200px;margin:0 auto;padding:64px 24px 32px}
      .hero h1{font-size:clamp(2rem,5vw,3rem);font-weight:700;letter-spacing:-0.03em;margin:0 0 14px}
      .hero p{font-size:17px;color:#9BA6B2;max-width:640px;line-height:1.65;margin:0}
      .posts{max-width:1200px;margin:0 auto;padding:24px 24px 24px;display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:20px}
      .card{background:#131A22;border:1px solid rgba(255,255,255,0.08);border-radius:20px;padding:26px 24px;text-decoration:none;display:flex;flex-direction:column}
      .card:hover{border-color:rgba(61,220,151,0.3)}
      .card .k{font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#3DDC97;margin-bottom:12px}
      .card h2{font-size:1.15rem;font-weight:600;color:#F5F7FA;line-height:1.3;margin:0 0 10px;letter-spacing:-0.01em}
      .card p{font-size:14px;color:#9BA6B2;line-height:1.6;margin:0 0 16px;flex:1}
      .card .m{font-size:12px;color:#6b7683}
    </style>`;

const nav = () => `
    <header class="nav"><div class="wrap row">
      <a class="brand" href="/">SPENDLY<span>.</span></a>
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
          <span class="brand">SPENDLY<span>.</span></span>
          <p style="font-size:12px;color:#9BA6B2;margin-top:8px;line-height:1.6;max-width:220px;">Kontrola kosztów restauracji z integracją KSeF i OCR faktur.</p>
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
<html lang="pl" class="dark">
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
<html lang="pl" class="dark">
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
  const urls = [
    ...STATIC_URLS.map((u) => ({ ...u, lastmod: today })),
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
