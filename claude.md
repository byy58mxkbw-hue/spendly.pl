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

### ⚠️ Do weryfikacji
- `ocr-faktur.tsx` — strona istnieje, wymaga sprawdzenia czy działa end-to-end
- `cennik.tsx` — strona istnieje, brak pewności co do backing endpointów
- Mapowanie dostawca/produkt — logika w bazie, UI niekompletne

### 🟡 Dług techniczny
- Pliki do rozbicia: `ksef.ts` (1585 linii), `ai-cfo.ts` (1300), `invoices.ts` (1037), `invoices.tsx` (2068), `reports.tsx` (1967), `products.tsx` (1966)
- Brak testów (unit / integration / e2e)
- Paginacja w tabeli Produktów
- Toast po synchronizacji KSeF

---

## Bezpieczeństwo — pilnuj tego

- Token KSeF szyfruj **zawsze** AES-256-GCM przed zapisem do bazy
- Klucz szyfrowania pochodzi z `process.env.KSEF_ENCRYPTION_KEY` (min. 32 znaki)
- W odpowiedzi API pokazuj token zamaskowany do ostatnich 4 znaków
- Wszystkie endpointy muszą być zabezpieczone Clerk middleware
- Nigdy nie loguj tokenów ani haseł do konsoli

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