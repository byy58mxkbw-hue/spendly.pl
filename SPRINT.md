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

## 2026-07-13 — Wydajność frontu (PageSpeed mobile 66, LCP 6.8s, FCP 3.8s)

### Zrobione
- **Async CSS (największy zysk FCP/LCP)** — Vite wstrzykiwał render-blocking
  `<link rel="stylesheet">` (~158KB) do `<head>`. Landing renderuje hero w całości
  na inline-stylach, więc ta CSS nie jest potrzebna do pierwszego paintu. Plugin
  `asyncCssPlugin` (`transformIndexHtml`) zamienia go na `preload`+`onload` z
  `<noscript>` fallbackiem → paint natychmiast, arkusz doładowuje się równolegle.
- **Kompresja gzip** (z Części 1) — main 723KB → 204KB transferu.
- **Font** — usunięta nieużywana grubość Inter 300 (mniej plików woff2 na
  krytycznej ścieżce); `font-display: swap` i preconnect już były.
- **Source maps w produkcji** (`build.sourcemap: true`) — czytelne stack-trace w
  konsoli i w Sentry. (Uwaga: mapy są publiczne; jeśli chcesz je ukryć a zachować
  w Sentry — `sourcemap: "hidden"` + upload map do Sentry.)
- **Analiza bundla** — `rollup-plugin-visualizer` gated `ANALYZE=true`
  (`ANALYZE=true pnpm --filter @workspace/ksef-monitor build` → `dist/stats.html`).

### Forced reflow (Zadanie 6)
- Brak realnego problemu. Jedyny odczyt layoutu (`scrollHeight`) jest w czacie AI
  (smooth-scroll na dół), nie na ścieżce renderowania landingu. Nic do batchowania.

### Redukcja JS (Zadanie 5) — analiza + decyzja
- Bundle: `main` 723KB/204KB gz (eager), `generateCategoricalChart` (recharts+lodash)
  396KB/110KB gz — **leniwie**, tylko na stronach z wykresami (dobrze). Route-chunki
  leniwe. Główni „pasażerowie" main: react-dom, @clerk/*, @sentry/*, framer-motion,
  react-query, wouter.
- **`manualChunks` przetestowane i ODRZUCONE** — wymuszony `vendor` wciągał leniwe
  zależności (jspdf, radix z podstron) do eager-bundla i podnosił sumę gzip
  (204→277KB). Automatyczny podział Rollupa jest tu lepszy. Zostawione bez zmian.
- **Prawdziwy „320KB unused" = landing ładuje pełny shell aplikacji** (Clerk/Sentry/
  react-query) mimo że statyczny landing ich nie używa do pierwszego renderu.
  **Follow-up (większy, osobno):** dedykowany lekki entry landingu bez ClerkProvider/
  react-query — najczystsza droga do zbicia LCP dalej. Wymaga rozdzielenia roota.

### Weryfikacja (po deployu, Patryk)
- PageSpeed mobile + desktop — porównać LCP/FCP/score przed/po.
- Sanity: landing renderuje się natychmiast (bez białego ekranu), brak FOUC.

## 2026-07-13 — Cookiebot (zgoda na cookies, RODO)

- Wpięty `<script id="Cookiebot" ... data-blockingmode="auto">` jako pierwszy
  element `<head>` we wszystkich 7 entry-HTML (index + cennik/ksef/ocr-faktur/
  food-cost/sign-in/sign-up). Tryb **auto** (świadoma decyzja: zgodność out-of-the-box).
- **CSP zaktualizowane** (inaczej wymuszone CSP z Części 1 zablokowałoby loader):
  `script-src` += consent.cookiebot.com + consentcdn.cookiebot.com; `frame-src`/
  `connect-src` += consentcdn.cookiebot.com; `img-src` += imgsct.cookiebot.com +
  consent.cookiebot.com.
- **Kompromis perf:** auto-blocking `uc.js` jest render-blocking z założenia (musi
  wykonać się przed trackerami) → lekki regres FCP/LCP. Jeśli PageSpeed to wypunktuje
  — przejść na **manual blocking** (uc.js async + ręczne oznaczenie Sentry=statistics,
  Clerk=necessary).
- Po deployu: potwierdzić, że banner zgody się pokazuje i że nie ma błędów CSP w konsoli.

## 2026-07-13 — Dostępność (a11y, WCAG AA)

- ✅ **`<main>` landmark** wokół głównej treści (`home.tsx` + statyczny prerender
  `index.html`) — aurora/nav/footer poza `<main>`.
- ✅ **Kolejność nagłówków** bez przeskoków (h1→h2→h3): kroki KSeF `h4→h3`,
  stopka `h5→h3` (+ selektory CSS `.step h3` / `.foot-col h3`).
- ✅ **Kontrast WCAG AA** — `--faint` był poniżej progu (dark 3.9:1, light 3.0:1
  przy AA≥4.5). Podbity: dark `.42→.55` = **5.9:1**, light `.45→.60` = **5.0:1**
  (wyliczone formułą WCAG). Nagłówki stopki z `--faint` na `--muted` (7.8:1).

## 2026-07-13 — Weryfikacja końcowa (Zadanie 9)

- ✅ **curl -I frontend** (`www.spendly.pl`): HSTS, X-Frame, X-Content-Type,
  Referrer, Permissions, **CSP (wymuszone)**, COOP, X-Permitted — wszystkie obecne.
- ✅ **curl -I API** (`api-server-production-de7e.up.railway.app`): HSTS, X-Frame
  DENY, nosniff, Referrer, Permissions, CSP, X-Permitted; `/api/healthz` = `{"status":"ok"}`.
- ✅ **CORS** preflight z `www.spendly.pl` → 204 + allow-credentials + methods/headers
  domknięte + allow-origin poprawny; obcy origin → BRAK allow-origin (whitelista działa).
- ✅ **Rate limiter** — zweryfikowany mechanizm (429 + `Retry-After: 900s` + JSON);
  ta sama konfiguracja `standardHeaders:"draft-8"` na prod.
- ⏳ **PageSpeed mobile** — do zmierzenia przez Patryka (baza 66/100, LCP 6.8s);
  wdrożone: gzip, brak render-blocking async-onload, source-mapy, trim fontu.
- ⏳ **Logowanie Clerk** — do potwierdzenia przez Patryka (CSP wymuszone; awaryjnie
  `CSP_REPORT_ONLY=true`). Strona renderuje się poprawnie (potwierdzone wizualnie).

### Pomiar PageSpeed mobile (po Części 1-3) + optymalizacja
- Zmierzone: **LCP 5,6s** (baza 6,8 → lepiej), **FCP 4,1s** (baza 3,8), **TBT 10ms**
  i **CLS 0** (idealne), SI 4,1s.
- Render-blocking 2170ms — rozbicie: **Cookiebot uc.js 1500ms** (dominuje) +
  Google Fonts 750ms + main.css 480ms (ładowane równolegle → FCP gated przez Cookiebot).
- ✅ **Cookiebot auto → manual + async** — uc.js przestaje blokować render (−1,5s
  na mobile). RODO zachowane (banner jest; Clerk=niezbędne; Sentry bez cookies).
- ✅ **llms.txt** — surowe URL-e → markdown-linki (błąd „Agent Accessibility").
- Pozostałe render-blockery (po Cookiebocie): Google Fonts 750ms + main.css 480ms —
  do rozważenia async z graceful degradation (font-fail = fallback, nie psuje strony)
  albo self-host Inter. Unused JS 114KB = dedykowany entry landingu (największy lever).

### Incydent (rozwiązany)
- Wymuszone CSP + async-CSS/font przez inline `onload` → strona bez stylów na prod.
  Fix: usunięty async-onload, entry-CSS render-blocking (gzip 26KB). Reguła 28 w claude.md.

### Dług / follow-up
- Dedykowany entry landingu (bez Clerk/Sentry/react-query) — realne −~250KB z
  pierwszego renderu. Największy pozostały lever na LCP.
- Async-CSS pod strict CSP: `'unsafe-hashes'`+hash handlera albo zewnętrzny loader.
- Ewentualne przejście Cookiebota na manual blocking, jeśli perf tego wymaga.
- A11y pozostałych stron marketingowych (cennik/ksef/ocr-faktur) — analogiczny audyt.
