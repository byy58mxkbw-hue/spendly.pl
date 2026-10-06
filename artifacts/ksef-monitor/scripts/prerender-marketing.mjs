// Prerender stron marketingowych, które nie mają własnego pliku HTML.
//
// Dlaczego: /porownanie-cen, /dla-kogo, /regulamin i /polityka-prywatnosci są
// renderowane wyłącznie przez Reacta z index.html. Surowy HTML miał więc tytuł,
// opis i canonical STRONY GŁÓWNEJ — Google traktował je jako duplikat "/"
// (Search Console 2026-10-06: /dla-kogo „URL nieznany", /porownanie-cen
// „wykryta, niezindeksowana"), a podglądy w social mediach pokazywały home.
//
// Co robi: po `vite build` renderuje prawdziwe komponenty stron (renderToString
// przez Vite SSR), bierze zbudowany dist/public/index.html jako szablon
// (hashowane assety, CSP-owe inline skrypty bez zmian), podmienia <head>
// (title/description/canonical/og/twitter, JSON-LD) i treść #root, a wynik
// zapisuje jako dist/public/<strona>.html. sirv serwuje /dla-kogo → dla-kogo.html
// tak samo jak /ksef → ksef.html. Po starcie React podmienia treść #root.
import fs from "node:fs";
import path from "node:path";
import { createServer } from "vite";

const ROOT = path.resolve(import.meta.dirname, "..");
const DIST = path.join(ROOT, "dist/public");
const SITE = "https://www.spendly.pl";

const PAGES = [
  { file: "porownanie-cen", module: "/src/pages/porownanie-cen.tsx", crumb: "Porównanie cen" },
  { file: "dla-kogo", module: "/src/pages/dla-kogo.tsx", crumb: "Dla kogo" },
  { file: "regulamin", module: "/src/pages/regulamin.tsx", crumb: "Regulamin" },
  { file: "polityka-prywatnosci", module: "/src/pages/polityka-prywatnosci.tsx", crumb: "Polityka prywatności" },
];

const escAttr = (s) => String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
const escText = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;");

function setTag(html, re, replacement, label) {
  if (!re.test(html)) throw new Error(`[prerender] brak w szablonie: ${label}`);
  return html.replace(re, replacement);
}

function buildHead(template, meta, crumb) {
  const url = meta.path === "/" ? `${SITE}/` : `${SITE}${meta.path}`;
  let h = template;
  h = setTag(h, /<title>[\s\S]*?<\/title>/, `<title>${escText(meta.title)}</title>`, "title");
  h = setTag(h, /<meta name="description" content="[^"]*"\s*\/?>/, `<meta name="description" content="${escAttr(meta.description)}" />`, "description");
  h = setTag(h, /<link rel="canonical" href="[^"]*"\s*\/?>/, `<link rel="canonical" href="${url}" />`, "canonical");
  h = setTag(h, /<meta property="og:url" content="[^"]*"\s*\/?>/, `<meta property="og:url" content="${url}" />`, "og:url");
  h = setTag(h, /<meta property="og:title" content="[^"]*"\s*\/?>/, `<meta property="og:title" content="${escAttr(meta.title)}" />`, "og:title");
  h = setTag(h, /<meta property="og:description" content="[^"]*"\s*\/?>/, `<meta property="og:description" content="${escAttr(meta.description)}" />`, "og:description");
  h = setTag(h, /<meta name="twitter:title" content="[^"]*"\s*\/?>/, `<meta name="twitter:title" content="${escAttr(meta.title)}" />`, "twitter:title");
  h = setTag(h, /<meta name="twitter:description" content="[^"]*"\s*\/?>/, `<meta name="twitter:description" content="${escAttr(meta.description)}" />`, "twitter:description");
  // keywords strony głównej nie pasują do podstron — usuwamy.
  h = h.replace(/\s*<meta name="keywords" content="[^"]*"\s*\/?>/, "");
  // JSON-LD strony głównej (FAQ, SoftwareApplication…) opisuje "/", nie tę
  // stronę — zostawienie go to dane strukturalne niezgodne z treścią.
  h = h.replace(/\s*<script type="application\/ld\+json">[\s\S]*?<\/script>/g, "");
  const ld = {
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "WebPage", "@id": url, url, name: meta.title, description: meta.description, inLanguage: "pl-PL", isPartOf: { "@id": `${SITE}/#website` } },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "Strona główna", item: `${SITE}/` },
          { "@type": "ListItem", position: 2, name: crumb, item: url },
        ],
      },
    ],
  };
  h = h.replace("</head>", `    <script type="application/ld+json">${JSON.stringify(ld)}</script>\n  </head>`);
  return h;
}

function replaceRoot(html, inner) {
  const start = html.indexOf('<div id="root">');
  const bodyEnd = html.lastIndexOf("</body>");
  const end = html.lastIndexOf("</div>", bodyEnd);
  if (start < 0 || end < start) throw new Error("[prerender] nie znaleziono #root w szablonie");
  return html.slice(0, start) + `<div id="root">${inner}</div>` + html.slice(end + "</div>".length);
}

const templatePath = path.join(DIST, "index.html");
if (!fs.existsSync(templatePath)) throw new Error(`[prerender] brak ${templatePath} — najpierw vite build`);
const template = fs.readFileSync(templatePath, "utf8");

const vite = await createServer({
  root: ROOT,
  configFile: path.join(ROOT, "vite.config.ts"),
  server: { middlewareMode: true, hmr: false },
  appType: "custom",
  // resolve.dedupe w configu sprawia, że Vite inline'uje Reacta (CJS) do SSR i
  // wywraca się na `module is not defined` — wymuszamy zewnętrzne ładowanie.
  ssr: { external: ["react", "react-dom", "wouter", "@phosphor-icons/react"] },
  logLevel: "error",
});

try {
  const React = (await import("react")).default;
  const { renderToString } = await import("react-dom/server");
  const { Router } = await import("wouter");
  for (const page of PAGES) {
    const mod = await vite.ssrLoadModule(page.module);
    globalThis.__SPENDLY_PAGE_META__ = undefined;
    const body = renderToString(
      React.createElement(Router, { ssrPath: `/${page.file}` }, React.createElement(mod.default)),
    );
    const meta = globalThis.__SPENDLY_PAGE_META__;
    if (!meta) throw new Error(`[prerender] ${page.file}: strona nie wywołała usePageMeta`);
    const html = replaceRoot(buildHead(template, meta, page.crumb), body);
    fs.writeFileSync(path.join(DIST, `${page.file}.html`), html);
    console.log(`[prerender] /${page.file} → ${page.file}.html (${Math.round(html.length / 1024)} KB, "${meta.title}")`);
  }
} finally {
  await vite.close();
}
