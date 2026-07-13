# SPRINT — bieżące zadania

## 2026-07-13 — Hardening nagłówków bezpieczeństwa + wydajność frontu

**Kontekst:** securityheaders.com dawał ocenę **F** dla `www.spendly.pl`. Przyczyna:
front (SPA) jest serwowany przez `vite preview` (sirv), który domyślnie nie ustawia
żadnych nagłówków bezpieczeństwa. API-server (`api.spendly.pl`) miał już komplet
nagłówków — F dotyczyło wyłącznie domeny frontu.

### Zrobione
- **Nagłówki bezpieczeństwa frontu** (`vite.config.ts`, plugin `securityHeadersPlugin`,
  wpięty w `configurePreviewServer`): HSTS (1 rok + includeSubDomains),
  X-Content-Type-Options, X-Frame-Options: SAMEORIGIN, Referrer-Policy,
  Permissions-Policy, X-DNS-Prefetch-Control, Cross-Origin-Opener-Policy,
  X-Permitted-Cross-Domain-Policies. → oczekiwana ocena **A**.
- **CSP** w trybie **Report-Only** (przełącznik `CSP_ENFORCE=true` → wymuszanie).
  Whitelist budowana z env: `VITE_API_BASE_URL` (API na innej domenie),
  `VITE_CLERK_PROXY_URL`, `VITE_SENTRY_DSN` + domeny Clerk/Turnstile. Po włączeniu
  wymuszania front daje **A+**.
- **Kompresja gzip** na `vite preview` (`compression`): main chunk 723KB → 204KB
  transferu (−72%).
- **API-server** (`app.ts`): HSTS 180 dni → 1 rok; dodany Permissions-Policy;
  CORS domknięty (jawne `methods` + `allowedHeaders` zamiast reflektowania).

### Zweryfikowane lokalnie
- `curl -I` na `vite preview` — wszystkie nagłówki obecne na HTML i assetach.
- Cache: `index.html` → `no-cache`; assety z hashem → `immutable, max-age=1y`.
- gzip: GET assetu z `Accept-Encoding: gzip` → 204KB zamiast 723KB.
- `pnpm typecheck` (api + web) — czysto.

### Do zrobienia przy wymuszaniu CSP (droga do A+)
1. Deploy z CSP w Report-Only, zebrać naruszenia (`Content-Security-Policy-Report-Only`).
2. Inline skrypt inicjalizujący motyw w `*.html` — policzyć hash sha256 i dodać do
   `script-src` **albo** wynieść do osobnego pliku.
3. Potwierdzić, że logowanie (Clerk) i OCR działają bez blokad CSP.
4. Ustawić `CSP_ENFORCE=true` w env frontu na Railway.

### Weryfikacja produkcyjna (do zrobienia przez Patryka po deployu)
- securityheaders.com dla `https://www.spendly.pl` — porównać F → A.
- PageSpeed Insights (mobile + desktop) — LCP/CLS/INP przed/po (zysk głównie z gzip).

### Dług / follow-up
- `main` chunk 723KB (204KB gzip) — rozważyć `manualChunks` (recharts jest już
  osobno). Niski priorytet po włączeniu kompresji.
