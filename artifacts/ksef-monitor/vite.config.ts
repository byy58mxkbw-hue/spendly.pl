import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import compression from "compression";
import path from "path";

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

function buildCsp(): string {
  const api = originFrom(process.env.VITE_API_BASE_URL);
  const clerkProxy = originFrom(process.env.VITE_CLERK_PROXY_URL);
  const sentry = originFrom(process.env.VITE_SENTRY_DSN);
  // Domeny Clerk (SDK + FAPI gdy proxy nie przechwytuje wszystkiego) i Turnstile.
  const clerk = ["https://*.clerk.accounts.dev", "https://*.clerk.com"];
  const turnstile = "https://challenges.cloudflare.com";

  const uniq = (arr: (string | null)[]) => Array.from(new Set(arr.filter(Boolean) as string[]));

  const connectSrc = uniq(["'self'", api, clerkProxy, sentry, ...clerk, "https://clerk-telemetry.com"]);
  const scriptSrc = uniq(["'self'", clerkProxy, ...clerk, turnstile]);
  const frameSrc = uniq(["'self'", turnstile, ...clerk]);

  return [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'self'",
    "form-action 'self'",
    "img-src 'self' data: blob: https://img.clerk.com",
    "font-src 'self' https://fonts.gstatic.com data:",
    // 'unsafe-inline' dla stylów jest konieczne: prerender w index.html i biblioteki
    // (framer-motion) wstrzykują inline style. To niskie ryzyko XSS.
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    // UWAGA: brak 'unsafe-inline' w script-src. Inline skrypt inicjalizujący motyw
    // w *.html zgłosi naruszenie w trybie Report-Only — przed wymuszeniem CSP
    // (CSP_ENFORCE=true) dodaj jego hash sha256 lub wynieś do pliku.
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
  const csp = buildCsp();
  const enforceCsp = process.env.CSP_ENFORCE === "true";
  return {
    name: "security-and-cache-headers",
    configurePreviewServer(server) {
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
          enforceCsp ? "Content-Security-Policy" : "Content-Security-Policy-Report-Only",
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
  plugins: [react(), tailwindcss(), securityHeadersPlugin()],
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
