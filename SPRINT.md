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
- **CSP WYMUSZAJĄCE** (`Content-Security-Policy`) — droga do **A+**. Whitelist
  budowana z env: `VITE_API_BASE_URL` (API na innej domenie), `VITE_CLERK_PROXY_URL`,
  `VITE_SENTRY_DSN` + domeny Clerk/Turnstile. Inline-skrypt motywu w `index.html`
  jest hashowany automatycznie (`collectInlineScriptHashes` skanuje zbudowane HTML
  i liczy sha256 → `script-src`), więc nie trzeba ręcznie utrzymywać hashy ani
  używać `'unsafe-inline'`. Awaryjny powrót: `CSP_REPORT_ONLY=true` w env frontu.
- **Kompresja gzip** na `vite preview` (`compression`): main chunk 723KB → 204KB
  transferu (−72%).
- **API-server** (`app.ts`): HSTS 180 dni → 1 rok; dodany Permissions-Policy;
  CORS domknięty (jawne `methods` + `allowedHeaders` zamiast reflektowania).

### Zweryfikowane lokalnie
- `curl -I` na `vite preview` — wszystkie nagłówki obecne na HTML i assetach.
- Cache: `index.html` → `no-cache`; assety z hashem → `immutable, max-age=1y`.
- gzip: GET assetu z `Accept-Encoding: gzip` → 204KB zamiast 723KB.
- `pnpm typecheck` (api + web) — czysto.

### CSP — po wymuszeniu (KRYTYCZNE po deployu)
CSP jest teraz **wymuszające**. Nie dało się przetestować Clerk lokalnie (brak
kluczy prod), więc TUŻ PO DEPLOYU:
1. Zaloguj się (Clerk) i zrób OCR faktury — sprawdź konsolę DevTools pod kątem
   `Refused to ... because it violates the Content-Security-Policy`.
2. Jeśli coś jest blokowane → `CSP_REPORT_ONLY=true` w env frontu na Railway
   (natychmiastowy powrót do trybu raportującego), zgłoś domenę — dopiszę do whitelisty.

### Weryfikacja produkcyjna (do zrobienia przez Patryka po deployu)
- securityheaders.com dla `https://www.spendly.pl` — porównać F → A.
- PageSpeed Insights (mobile + desktop) — LCP/CLS/INP przed/po (zysk głównie z gzip).

### Dług / follow-up
- `main` chunk 723KB (204KB gzip) — rozważyć `manualChunks` (recharts jest już
  osobno). Niski priorytet po włączeniu kompresji.
