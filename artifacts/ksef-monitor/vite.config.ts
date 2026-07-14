import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import compression from "compression";
import { visualizer } from "rollup-plugin-visualizer";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import path from "path";

// UWAGA: NIE używamy async-CSS przez inline `onload` (preload+onload). Wymuszone
// CSP (script-src bez 'unsafe-inline') blokuje inline event-handlery, więc onload
// nigdy się nie odpala → arkusz nie zostaje zastosowany → strona bez stylów.
// Entry-CSS zostaje zwykłym render-blocking <link> (przy gzip ~26KB, koszt znikomy).
// Async-CSS pod strictnym CSP wymagałby 'unsafe-hashes' + hash handlera albo
// zewnętrznego loadera — TODO jeśli PageSpeed tego zażąda.

// ── CSP: whitelist budowana z env produkcyjnego ──────────────────────────────
// Front (www.spendly.pl) woła API na INNEJ domenie (VITE_API_BASE_URL), Clerk
// idzie przez proxy (VITE_CLERK_PROXY_URL), Sentry na własny ingest. Zamykamy
// connect-src/script-src do realnych źródeł zamiast wildcardów. Env są dostępne
// w procesie `vite preview` (Railway ustawia je do buildu ORAZ w runtime).
function originFrom(url?: string): string | null {
  if (!url) return null;
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

// Dekoduje domenę Clerk Frontend API z klucza publicznego (pk_live_/pk_test_).
// Klucz = "pk_live_" + base64("clerk.twojadomena.pl$"). Produkcyjny Clerk na
// custom-domenie (clerk.spendly.pl) serwuje z niej clerk-js i FAPI — MUSI być
// w CSP, inaczej logowanie nie ładuje się (biały ekran).
function clerkFapiFromPk(pk?: string): string | null {
  if (!pk) return null;
  const b64 = pk.replace(/^pk_(live|test)_/, "");
  try {
    const host = Buffer.from(b64, "base64").toString("utf8").replace(/\$+$/, "").trim();
    return /^[a-z0-9.-]+$/i.test(host) ? `https://${host}` : null;
  } catch {
    return null;
  }
}

// Zbiera hashe sha256 wszystkich inline-skryptów (bez `src`, poza JSON-LD, który
// nie jest wykonywany) ze ZBUDOWANYCH plików HTML. Dzięki temu wymuszone CSP nie
// blokuje skryptu inicjalizującego motyw, a hash jest liczony z realnego bajtowo
// outputu (Vite może go zminifikować) — automatycznie, bez ręcznej podmiany.
function collectInlineScriptHashes(outDir: string): string[] {
  const hashes = new Set<string>();
  const scriptRe = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  try {
    for (const file of readdirSync(outDir)) {
      if (!file.endsWith(".html")) continue;
      const html = readFileSync(path.join(outDir, file), "utf8");
      for (const [, attrs, body] of html.matchAll(scriptRe)) {
        if (/\bsrc=/i.test(attrs)) continue; // zewnętrzny — pokrywa go 'self'
        if (/application\/ld\+json/i.test(attrs)) continue; // dane, nie kod
        if (!body) continue;
        const hash = createHash("sha256").update(body, "utf8").digest("base64");
        hashes.add(`'sha256-${hash}'`);
      }
    }
  } catch (err) {
    console.warn(`[csp] nie udało się policzyć hashy inline-skryptów: ${(err as Error).message}`);
  }
  return [...hashes];
}

function buildCsp(scriptHashes: string[]): string {
  const api = originFrom(process.env.VITE_API_BASE_URL);
  const clerkProxy = originFrom(process.env.VITE_CLERK_PROXY_URL);
  const sentry = originFrom(process.env.VITE_SENTRY_DSN);
  // Domeny Clerk: wildcardy dev/fallback + PRODUKCYJNA custom-domena FAPI z klucza
  // (np. clerk.spendly.pl) — bez niej wymuszone CSP blokuje clerk-js i logowanie
  // pokazuje biały ekran.
  const clerkFapi = clerkFapiFromPk(process.env.VITE_CLERK_PUBLISHABLE_KEY);
  const clerk = ["https://*.clerk.accounts.dev", "https://*.clerk.com", clerkFapi].filter(Boolean) as string[];
  const turnstile = "https://challenges.cloudflare.com";
  // Cookiebot (zgoda na cookies): loader z consent.cookiebot.com, dialog/CDN
  // z consentcdn.cookiebot.com, obrazki z imgsct.cookiebot.com.
  const cookiebot = ["https://consent.cookiebot.com", "https://consentcdn.cookiebot.com"];
  // PostHog (EU): SDK/recorder z eu-assets.i.posthog.com, ingestion z eu.i.posthog.com.
  const posthog = ["https://eu.i.posthog.com", "https://eu-assets.i.posthog.com"];

  const uniq = (arr: (string | null)[]) => Array.from(new Set(arr.filter(Boolean) as string[]));

  const connectSrc = uniq(["'self'", api, clerkProxy, sentry, ...clerk, "https://clerk-telemetry.com", turnstile, "https://consentcdn.cookiebot.com", ...posthog]);
  // Hashe inline-skryptów zamiast 'unsafe-inline' — CSP zostaje realną ochroną XSS.
  const scriptSrc = uniq(["'self'", clerkProxy, ...clerk, turnstile, ...cookiebot, "https://eu-assets.i.posthog.com", ...scriptHashes]);
  const frameSrc = uniq(["'self'", turnstile, ...clerk, "https://consentcdn.cookiebot.com", "https://eu.posthog.com"]);

  return [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'self'",
    "form-action 'self'",
    `img-src 'self' data: blob: https://img.clerk.com https://imgsct.cookiebot.com https://consent.cookiebot.com${clerkFapi ? " " + clerkFapi : ""}`,
    "font-src 'self' https://fonts.gstatic.com data:",
    // 'unsafe-inline' dla stylów jest konieczne: prerender w index.html i biblioteki
    // (framer-motion) + banner Cookiebota wstrzykują inline style. Niskie ryzyko XSS.
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    `script-src ${scriptSrc.join(" ")}`,
    `connect-src ${connectSrc.join(" ")}`,
    "worker-src 'self' blob:",
    `frame-src ${frameSrc.join(" ")}`,
    "upgrade-insecure-requests",
  ].join("; ");
}

// ── Nagłówki bezpieczeństwa + cache dla `vite preview` (produkcja frontu) ─────
// `vite preview` (sirv) domyślnie nie ustawia ani nagłówków bezpieczeństwa
// (securityheaders.com = F), ani Cache-Control (po deployu losowo stara/nowa
// wersja). Ten plugin domyka jedno i drugie w jednym miejscu.
function securityHeadersPlugin(): Plugin {
  const outDir = path.resolve(import.meta.dirname, "dist/public");
  // Domyślnie CSP wymuszające. Awaryjny powrót do Report-Only bez zmiany kodu:
  // ustaw CSP_REPORT_ONLY=true w env frontu na Railway.
  const reportOnly = process.env.CSP_REPORT_ONLY === "true";
  return {
    name: "security-and-cache-headers",
    configurePreviewServer(server) {
      const csp = buildCsp(collectInlineScriptHashes(outDir));
      // Kompresja odpowiedzi (gzip) — sirv sam nie kompresuje, a główny chunk to
      // ~700KB nieskompresowane. Dodane jako pierwsze, żeby objąć odpowiedzi sirv.
      server.middlewares.use(compression());

      server.middlewares.use((req, res, next) => {
        // Nagłówki bezpieczeństwa — na każdą odpowiedź.
        res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
        res.setHeader("X-Content-Type-Options", "nosniff");
        res.setHeader("X-Frame-Options", "SAMEORIGIN");
        res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
        res.setHeader(
          "Permissions-Policy",
          "camera=(self), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()",
        );
        res.setHeader("X-DNS-Prefetch-Control", "off");
        res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
        res.setHeader("X-Permitted-Cross-Domain-Policies", "none");
        res.setHeader(
          reportOnly ? "Content-Security-Policy-Report-Only" : "Content-Security-Policy",
          csp,
        );

        // Cache: HTML zawsze rewalidowany; zasoby z hashem w nazwie na stałe.
        if (!req.url || /\.html($|\?)/.test(req.url) || req.url === "/" || !/\.[a-z0-9]+($|\?)/i.test(req.url)) {
          res.setHeader("Cache-Control", "no-cache");
        } else {
          res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
        }
        next();
      });
    },
  };
}

const rawPort = process.env.PORT;
const port = Number(rawPort ?? "3000");

if (rawPort !== undefined && (Number.isNaN(port) || port <= 0)) {
  console.warn(`Invalid PORT value: "${rawPort}"; falling back to 3000.`);
}

const basePath = process.env.BASE_PATH || "/";

export default defineConfig({
  base: basePath,
  plugins: [
    react(),
    tailwindcss(),
    securityHeadersPlugin(),
    // Analiza bundla: `ANALYZE=true pnpm --filter @workspace/ksef-monitor build`
    // → dist/stats.html (nie generowane w zwykłym buildzie).
    ...(process.env.ANALYZE === "true"
      ? [visualizer({ filename: "dist/stats.html", gzipSize: true, brotliSize: true }) as Plugin]
      : []),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      "@assets": path.resolve(import.meta.dirname, "..", "..", "attached_assets"),
    },
    dedupe: ["react", "react-dom"],
  },
  root: path.resolve(import.meta.dirname),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
    // Source mapy w produkcji — czytelne stack-trace w konsoli i w Sentry.
    sourcemap: true,
    rollupOptions: {
      input: {
        main: path.resolve(import.meta.dirname, "index.html"),
        "sign-in": path.resolve(import.meta.dirname, "sign-in.html"),
        "sign-up": path.resolve(import.meta.dirname, "sign-up.html"),
        ksef: path.resolve(import.meta.dirname, "ksef.html"),
        "food-cost": path.resolve(import.meta.dirname, "food-cost.html"),
        "ocr-faktur": path.resolve(import.meta.dirname, "ocr-faktur.html"),
        cennik: path.resolve(import.meta.dirname, "cennik.html"),
      },
      // Bez manualChunks — automatyczny podział Rollupa jest tu lepszy: trzyma
      // recharts/jspdf/radix w LENIWYCH chunkach per-route, a wymuszone grupowanie
      // (vendor/react) pogarszało wynik (wciągało lazy-deps do eager-bundla).
    },
  },
  server: {
    port,
    strictPort: false,
    host: "0.0.0.0",
    allowedHosts: true,
    proxy: {
      "/api": {
        target: "http://localhost:8080",
        changeOrigin: true,
      },
    },
    fs: {
      strict: true,
    },
  },
  preview: {
    port,
    host: "0.0.0.0",
    allowedHosts: true,
  },
});
