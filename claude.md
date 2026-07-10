# Spendly — Instrukcja dla Claude Code

Jesteś głównym developerem aplikacji **Spendly** — SaaS dla restauracji do monitorowania cen surowców z faktur KSeF. Twoim celem jest sprawić żeby aplikacja była jak najbardziej funkcjonalna, bezpieczna i przyjemna w użyciu.

---

## Twoja rola

- Działasz jak doświadczony senior developer — nie czekasz na każde pytanie, sam proponujesz ulepszenia
- Po każdym zadaniu krótko podsumuj co zrobiłeś i zaproponuj **1–2 konkretne następne kroki**
- Jeśli widzisz błąd, lukę bezpieczeństwa lub możliwość ulepszenia — powiedz o tym nawet jeśli nie było to w zadaniu
- Pisz po polsku

---

## Stack — zapamiętaj raz na zawsze

```
pnpm workspaces (NIE npm, NIE yarn)
Node.js 24, TypeScript 5.9
API: Express 5, port 8080
Frontend: React + Vite + shadcn/ui + Tailwind, port 22900
DB: PostgreSQL + Drizzle ORM
Auth: Clerk (@clerk/express na serwerze, @clerk/react na kliencie)
Walidacja: Zod (zod/v4), drizzle-zod
API codegen: Orval (z OpenAPI spec)
Build: esbuild (CJS bundle)
Routing: wouter
Wykresy: recharts
```

---

## Krytyczne zasady — nigdy nie łam

1. **Po zmianie plików w `artifacts/api-server/src/routes/`** — zawsze restartuj api-server. Działa na pre-built dist bundle.

2. **`db.execute()` zwraca `{ rows: [...] }`** — zawsze używaj `.rows`, nigdy nie traktuj wyniku jako tablicy.

3. **`invoice_date` to typ TEXT** (format YYYY-MM-DD) — używaj string operations, nie `date_trunc`.

4. **`lib/api-zod/src/index.ts`** — eksportuje TYLKO `export * from "./generated/api"`. Orval nadpisuje ten plik, nie dodawaj tu niczego innego.

5. **Ceny i ilości to typ `numeric`** — przekazuj wartości numeryczne, nie stringi przy INSERT.

6. **GROUP BY z raw SQL** — używaj pozycyjnego GROUP BY (np. `GROUP BY 1, 2, 3`) i `sql.raw()` dla LIMIT.

7. **Clerk auth** — używa `publishableKeyFromHost` dla obsługi dev i prod. Proxy przez ścieżkę `/clerk`.

8. **Nigdy nie commituj sekretów** — `.env` jest w `.gitignore`. Zmienne: `DATABASE_URL`, `KSEF_ENCRYPTION_KEY`.
9. **`encryptSecret` / `decryptSecret`** — zawsze używaj z `../lib/encryption`. Nie pisz własnego szyfrowania.

10. **`categorizeProductWithAI`** — `../lib/categorize-ai`. Nie wywołuj OpenAI bezpośrednio do kategoryzacji.

11. **`checkAlertsAfterImport`** — `../services/alert-checker`. Wywołuj po każdym imporcie faktury.

12. **`formatPrice` / formatowanie dat** — `@/lib/format`. Nie pisz własnych formaterów.

13. **`toNum` / `toNumOrNull`** — `../lib/parse`. Używaj do konwersji numeric z bazy.

14. **Jedna faktura analizowana tylko raz** — po imporcie dane są w bazie. Nie uruchamiaj ponownie OCR ani AI na tej samej fakturze.

15. **KSeF session cache** — `session_token` + `session_valid_until` w `ksef_config` to cache sesji KSeF. Sprawdzaj przed auth handshake, nie rób go przy każdym sync.

16. **`rate_limited_until`** — sprawdzaj PRZED każdym KSeF sync. Jeśli ustawione i w przyszłości — przerwij i poinformuj użytkownika.

17. **`conversations.ts` i `messages.ts`** — pliki istnieją w `lib/db/src/schema/` ale nie są eksportowane w `index.ts`. To martwe pliki — nie używaj ich.

18. **Kolejność middleware w `app.ts`** — CORS musi być PRZED helmet i rate-limit. Nie zmieniaj tej kolejności (hotfix 2026-06-30).

19. **Compression pomija SSE** — `compression` ma wykluczenie dla `text/event-stream`. Bez tego sync KSeF się wiesza. Nie usuwaj tego wyjątku.

20. **KSeF sync działa przez SSE** — postęp streamowany na dashboard, bez 30s timeoutu. Nie dodawaj timeoutów na streamie.

21. **Rate-limit pomija `/api/healthz`** — ścieżka skip musi odpowiadać faktycznemu route.

22. **Sugestie centrów kosztów** — `resuggestForUser` (`routes/cost-centers.ts`) używa `inArray`, NIE surowego `ANY(${ids})` (Drizzle nie serializuje tablicy JS → wyjątek, sugestie nigdy się nie liczą). Przeliczanie po dodaniu/edycji aliasów robi FRONTEND (`useResuggestCostCenters`) — nie dubluj w backendzie. Sugestia idzie do `suggestedCostCenterId` (nie `costCenterId`) — user akceptuje; auto-import z KSeF NIE auto-przypisuje.

23. **XXE / parser XML** — parser KSeF jest regexowy (bez DOM). Odrzucaj XML z `<!DOCTYPE`/`<!ENTITY`: guard jest w `parseFA3Xml` (throw) oraz w imporcie ręcznym faktur (400). Nie podmieniaj na parser DOM bez wyłączenia DTD/encji zewnętrznych.

24. **Limity AI zależne od planu** — plan w Clerk `publicMetadata.plan` (`free|pro|business`, brak=free), `requireUser` ustawia `req.plan`. Limity miesięczne w `lib/ai-plan.ts` (free 50 / pro 1000 / business ∞). Zliczanie w tabeli `ai_usage` (Postgres, klucz `period` 'YYYY-MM' — NIE in-memory, bo redeploye zerują pamięć). Middleware `aiQuota` na `/ai-cfo/chat` i `/invoices/scan-receipt` (za `requireUser`); inkrement tylko przy statusie <400. Plan nadaje admin (`PATCH /admin/users/:id/plan`). Reset miesięczny automatyczny (nowy period).
---

## Struktura projektu

```
lib/
  api-spec/openapi.yaml        ← source of truth dla API (tu zacznij przy nowych endpointach)
  api-zod/src/generated/       ← AUTO-GENEROWANE, nie edytuj ręcznie
  api-client-react/src/generated/ ← AUTO-GENEROWANE, nie edytuj ręcznie
  db/src/schema/               ← Drizzle schemas (suppliers, products, invoices, invoice_items, price_alerts)

artifacts/
  api-server/src/routes/       ← Express route handlers
  ksef-monitor/src/
    pages/                     ← strony React (dashboard, dostawcy, produkty, faktury, raporty, alerty)
    components/layout.tsx      ← sidebar + layout shell
    lib/categories.ts          ← kategorie produktów z keywords
```

---

## Workflow przy nowym endpoincie

```
1. Dodaj do lib/api-spec/openapi.yaml
2. pnpm --filter @workspace/api-spec run codegen
3. Napisz handler w artifacts/api-server/src/routes/
4. Zarejestruj route w głównym pliku serwera
5. Zrestartuj api-server
6. Użyj wygenerowanego hooka React Query na frontendzie
```

---

## Formatowanie — zawsze tak samo

```typescript
// Ceny
new Intl.NumberFormat('pl-PL', { style: 'currency', currency: 'PLN' }).format(price)
// lub użyj formatPrice() z @/lib/format

// Daty
new Date(date).toLocaleDateString('pl-PL')
```

---

## Design — styl aplikacji

- Inspiracja: cheff.it — czysto, minimalnie, dużo whitespace
- Accent color: teal `hsl(173, 80%, 40%)` = `#14B8A6`
- Komponenty: shadcn/ui
- **Bez emoji w UI** (emoji są tylko w kategoriach produktów w categories.ts)
- Responsywność: mobile-first, osobne układy dla md: breakpoint

---

## Stan aplikacji — co działa, co nie

### ✅ Działa
- Dashboard z wykresami i aktywnymi alertami
- Dostawcy — CRUD, historia faktur, sugestie centrum kosztów
- Produkty — tabela, historia cen, korekta kategorii, porównanie dostawców, bulk-verify
- Faktury — lista, ręczny import, OCR (scan-receipt), timeline, kalendarz, płatności, exclude, mark-paid
- Raporty — miesięczne, kategorie, trend, centra kosztów, predykcja, eksport CSV
- Alerty cenowe — CRUD, historia, dismiss, auto-sprawdzanie po imporcie
- Centra kosztów — CRUD, przypisanie do faktur i dostawców
- KSeF — konfiguracja (NIP + token AES-256-GCM), sync z API v2, cache sesji, rate-limit guard, sync_from_date
- Kolejka "Do przeglądu" — pending invoices (accept/reject/retry/delete)
- AI CFO — chat, analiza food cost, ekstrakcja menu, sesje z TTL
- AI Insights — generowanie, odczyt, dismiss
- Food cost — dania z przepisami (dish_ingredients), kalkulacja kosztu
- Admin panel — lista użytkowników, statystyki, blokowanie, usuwanie
- User categories — nadpisywanie nazw kategorii przez użytkownika
- Product corrections — zapamiętywanie ręcznych korekt kategorii
- Paginacja serwerowa — Produkty i Faktury (search, kategoria, sort po stronie API)
- Wyszukiwarka globalna + paleta komend Cmd+K (`routes/search.ts`)
- KSeF sync przez SSE — live progress na dashboardzie, czytelny wynik po sync
- Onboarding (`welcome-onboarding.tsx`) + landing page (`home.tsx`)
- Strony błędów — `not-found.tsx`, `server-error.tsx`, `error-boundary.tsx`
- Auto-sugestia centrum kosztów z KSeF XML (aliasy per centrum)
- Cross-linki — alert → wykres cen, kategoria raportu → produkty; modal historii cen z najtańszym dostawcą i fakturami źródłowymi
- Modal faktury — link do dostawcy, kopiowanie numeru, mark paid, print/PDF; porównanie dwóch faktur w AI CFO (z eksportem PDF)
- Faktury korygujące — obsługa + filtrowanie korekt w historii cen
- Bezpieczne usuwanie konta
- Kategorie: dodane Sprzęt/Wyposażenie i Orzechy/Bakalie; backfill kategorii przy starcie prod
- Security hardening (2026-06) — tenant isolation w food-cost, KSeF: NIP tenancy + token proof + per-NIP lock, ochrona przed nadużyciem AI
- Szklany (glass) wygląd na wszystkich stronach panelu (2026-07) — aurora + mennica `#3DDC97`, spójnie z landingiem; utility `.glass` w `index.css`
- Kalendarz w „Do przeglądu" (2026-07) — heatmapa faktur oczekujących po dniach (klik dnia → filtr listy), liczony klientowo bez nowego zapytania
- Sugestie centrów kosztów działające (2026-07) — przeliczane po każdym sync i po edycji aliasów; oparte na aliasach `Podmiot3`/opisu → domyślnym centrum dostawcy → historii; chip „Sugerowane" + „Zastosuj sugestie" (suggest-only, user akceptuje)
- XXE hardening (2026-07) — odrzucanie XML z `<!DOCTYPE`/`<!ENTITY` (parser regexowy, patrz reguła 23)
- Limity AI per plan (2026-07) — miesięczny limit czatu AI CFO + OCR wg planu (free/pro/business) liczony w tabeli `ai_usage`; plan nadawany w panelu admina (patrz reguła 24)
- Testy + CI (2026-07, Faza 0) — Vitest (projekty `api`/`web`, `pnpm test`), root `vitest.config.ts`; CI na GitHub Actions (`.github/workflows/ci.yml`: install→typecheck→build→test, serwis postgres:16 + `push-force` schematu). Testy kolokowane `*.test.ts(x)` wykluczone z produkcyjnego tsc. Testy DB-zależne gate'owane `TEST_DATABASE_URL` (odpalają się tylko w CI). Root `build` wyklucza `mockup-sandbox`/`spendly-mobile` (wymagają env Expo).
- Monitoring błędów (2026-07, Faza 1) — Sentry na API (`instrument.ts`, no-op bez `SENTRY_DSN`) i froncie (`lib/sentry.ts`, `VITE_SENTRY_DSN`, wpięty w `error-boundary`); readiness `/api/healthz/ready` (SELECT 1). DSN-y do ustawienia w Railway (jeszcze nieustawione).
- Testy krytyczne (2026-07, Faza 2) — izolacja tenantów (`/api/suppliers`), dedup faktur (`/api/invoices/import`), szyfrowanie tokenu (AES-GCM), limity AI, guard XXE. Wzorzec testu route: mock `@clerk/express` steruje `userId`, uderzenie w prawdziwy endpoint na test-Postgresie.

### ⚠️ Do weryfikacji
- `ocr-faktur.tsx` i `cennik.tsx` — to STATYCZNE strony marketingowe (własny NavBar, hardcoded kolory `#0B0F14`, zero wywołań API). NIE są zepsutymi funkcjami — nie potrzebują backendu. Funkcjonalny OCR jest na stronie Faktur (`/invoices/scan-receipt`). UWAGA: obie tkwią w starym, zawsze-ciemnym motywie (nie używają glass/theme z landingu) — niespójne wizualnie z `home.tsx`.
- Niespójność cennika: `home.tsx` pokazuje 3 plany (Start 0 / Pro 199 / Sieć wycena), a `cennik.tsx` 1 plan (0 zł, 200 przekreślone). Do ujednolicenia (decyzja biznesowa).
- Mapowanie produktów — DZIAŁA w przepływie akceptacji „Do przeglądu" (`pending-invoices.tsx`): mapowanie pozycji faktury na produkt (`itemMappings`), pomijanie pozycji, tworzenie produktu w locie. Poza tym przepływem brak osobnego ekranu mapowania (i raczej niepotrzebny).

### 🟡 Dług techniczny
- Pliki do rozbicia: `ksef.ts` (1592 linie), `ai-cfo.ts` (1300), `invoices.ts` (1180), `invoices.tsx` (2271), `reports.tsx` (1981), `products.tsx` (2085)
- Testy: jest tylko jeden e2e (`scripts/src/e2e/ksef-sync.spec.ts`) — brak unit i integration

### ✔️ Zrobione (usunięte z długu)
- Paginacja w tabeli Produktów — serwerowa (2026-06-30)
- Toast po synchronizacji KSeF — zastąpione przez SSE z czytelnym wynikiem (2026-07-02)

---

## Bezpieczeństwo — pilnuj tego

- Token KSeF szyfruj **zawsze** AES-256-GCM przed zapisem do bazy
- Klucz szyfrowania pochodzi z `process.env.KSEF_ENCRYPTION_KEY` (min. 32 znaki)
- W odpowiedzi API pokazuj token zamaskowany do ostatnich 4 znaków
- Wszystkie endpointy muszą być zabezpieczone Clerk middleware
- Nigdy nie loguj tokenów ani haseł do konsoli
- XML z KSeF / importu ręcznego: odrzucaj `<!DOCTYPE`/`<!ENTITY` (guard w `parseFA3Xml` + import ręczny). Parser jest regexowy — nie podmieniaj na DOM bez wyłączenia encji (XXE)

---

## Komendy

```bash
pnpm --filter @workspace/api-server run dev        # API server (port 8080)
pnpm --filter @workspace/ksef-monitor run dev      # Frontend (port 22900)
pnpm run typecheck                                  # TypeScript check
pnpm run build                                      # Build wszystkiego
pnpm --filter @workspace/api-spec run codegen      # Regeneruj hooki i Zod schemas
pnpm --filter @workspace/db run push               # Push schema do bazy (tylko dev)
```

---

## Tryby pracy

### /zaplanuj
Gdy użytkownik napisze `/zaplanuj` (z opisem lub bez), wchodzę w tryb planowania:

1. **Przeglądam projekt** — czytam aktualne pliki, sprawdzam co działa
2. **Zadaję pytania** — maksymalnie 3 konkretne pytania naraz, żeby doprecyzować cel
3. **Proponuję opcje** — przedstawiam 2–3 podejścia z krótkim opisem zalet/wad każdego
4. **Sugeruję co warto zrobić** — na podstawie stanu projektu wskazuję co ma największy sens teraz
5. **Czekam na decyzję** — nie zaczynam kodować dopóki nie potwierdzisz planu

Przykłady użycia:
- `/zaplanuj` — przeglądam projekt i proponuję co zrobić dalej
- `/zaplanuj dodać powiadomienia email` — planuję konkretną funkcję
- `/zaplanuj ten sprint` — układam zadania na najbliższy tydzień

### /zrób [zadanie]
Tryb autonomiczny — działam bez pytań aż do skutku (patrz niżej).

### /sprawdź
Przeglądam cały projekt pod kątem błędów, bezpieczeństwa i możliwych ulepszeń. Zwracam listę konkretnych obserwacji bez wprowadzania zmian.

---

## Jak ze mną pracować

- Dawaj mi **jedno zadanie na raz** — robię je dokładnie, nie po łebkach
- Jeśli zadanie jest niejasne — zapytam zanim zacznę kodować
- Po skończeniu zadania zaproponuję co warto zrobić dalej
- Jeśli coś widzę w kodzie co warto poprawić — powiem Ci o tym

## Tryb autonomiczny — oszczędzanie tokenów

Pracuję samodzielnie aż do skutku. Nie pytam o potwierdzenie każdego kroku.

**Mój proces przy każdym zadaniu:**
1. Planuję co zrobię (krótko, bez lania wody)
2. Wprowadzam zmiany
3. Uruchamiam `pnpm run typecheck` — sprawdzam błędy TypeScript
4. Uruchamiam serwer i testuję endpoint / stronę
5. Jeśli coś nie działa — sam poprawiam, nie pytam
6. Wracam do Ciebie TYLKO gdy:
   - Wszystko działa i jest gotowe ✅
   - Napotkałem problem którego nie mogę rozwiązać bez Twojej decyzji ❌
   - Potrzebuję danych których nie mam (np. prawdziwy token KSeF) ❓

**Zasady oszczędzania tokenów:**
- Nie piszę długich wyjaśnień w trakcie pracy — działam
- Nie czytam plików które nie są potrzebne do zadania
- Nie przepisuję całych plików gdy zmieniam 3 linie — używam precyzyjnych edycji
- Nie generuję kodu "na wszelki wypadek" — tylko to co potrzebne
- Podsumowanie po zadaniu: maksymalnie 5 zdań + propozycja następnego kroku
# 31. Lokalizacja projektu

Projekt znajduje się lokalnie pod ścieżką:

C:\Users\nowys\spendly

Nie zakładaj innej struktury katalogów. Korzystaj z istniejącego repozytorium.

---

# 32. Priorytetowe pliki

Przed rozpoczęciem pracy korzystaj z następujących plików:

- CLAUDE.md – główna instrukcja projektu
- README.md – opis architektury i uruchamiania
- package.json – skrypty i zależności
- tsconfig.json
- tsconfig.base.json

Nie czytaj ich wielokrotnie podczas jednej sesji.

---

# 33. Nie przeszukuj całego repozytorium

Nie wykonuj globalnego skanowania projektu.

Czytaj wyłącznie pliki potrzebne do bieżącego zadania.

Jeżeli analizowałeś plik wcześniej w tej samej sesji, wykorzystaj pamięć zamiast ponownego odczytu.

---

# 34. Pracuj na istniejącej architekturze

Nie twórz nowych mechanizmów, jeżeli podobne już istnieją.

Najpierw wyszukaj istniejące:
- komponenty,
- endpointy,
- helpery,
- hooki,
- funkcje,
- schematy bazy.

Preferuj ponowne użycie zamiast duplikacji.

---

# 35. Dbaj o wydajność aplikacji

Każda zmiana powinna poprawiać lub zachowywać:
- szybkość działania,
- małą liczbę zapytań do bazy,
- małą liczbę wywołań AI,
- niskie zużycie RAM,
- niskie zużycie CPU.

Preferuj cache, indeksy, paginację i przetwarzanie asynchroniczne.

---

# 36. Dbaj o bezpieczeństwo

Przed każdą zmianą oceń:
- wpływ na bezpieczeństwo,
- wpływ na prywatność,
- możliwość wycieku danych,
- możliwość ataku.

Nie zapisuj sekretów w kodzie ani logach.

Nie ujawniaj danych innych użytkowników.

---

# 37. Finalna zasada

Myśl jak CTO i architekt systemu.

Każdy commit powinien:
- zwiększać jakość projektu,
- nie pogarszać wydajności,
- nie pogarszać bezpieczeństwa,
- nie zwiększać niepotrzebnie zużycia tokenów,
- zachowywać prostotę i skalowalność kodu.