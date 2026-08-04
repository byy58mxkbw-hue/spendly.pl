# Spec: Redesign modułu Raporty (`/reports`) — Spendly

Wersja robocza v3 (2026-08-04). Bazuje na planie v2, ale **skorygowana po rozpoznaniu kodu** —
oryginał pisany był bez dostępu do repo i część założeń się nie potwierdziła (patrz „Korekty").

## Cel

1. Layout wykorzystuje szerokość ekranu na desktopie (dziś `max-w-5xl` = 1024 px).
2. Kwota i ilość produktu żyją w jednej tabeli, nie w dwóch osobnych kartach.
3. „Dlaczego tyle" jako waterfall zamiast listy pasków.
4. Centrum kosztów jako czytelna oś nawigacji.

Bez zmian: eksport CSV/Excel, logika „vs poprzedni okres" / „vs zwykle", strona Food Cost.

---

## Etap 0 — Rozpoznanie (WYKONANE, wyniki poniżej)

| Element | Ustalenie |
| --- | --- |
| Strona | `artifacts/ksef-monitor/src/pages/reports.tsx` (975 linii) + `pages/reports/components.tsx` i `pages/reports/charts.tsx` |
| Dane | Hooki Orval: `useGetMonthlyReport`, `useGetSpendBridge`, `useGetCategorySpendTrend`; backend `routes/reports.ts` |
| Okres | `contexts/period-context.tsx` — `[from,to]` + presety; selektor to `MonthNavigator` + popover z kalendarzem |
| Centrum kosztów | `contexts/cost-center-context.tsx` — **globalny selektor już istnieje** (w headerze), `costCenterId` **już trafia do zapytań** raportów |
| Kolory centrów | `cost_centers.color` **w bazie, per użytkownik** — dostępne przez `useCostCenter().costCenters[].color` |
| Wykresy | recharts (lazy chunk) — **brak natywnego waterfall**, trzeba stacked bar z przezroczystym offsetem |
| Food cost % | `GET /api/reports/food-cost-ratio?month=` — używany na Dashboardzie (`foodCostPct`, `prevFoodCostPct`), sam się chowa gdy brak przychodu |
| KPI karty | `SpendHero` w `pages/reports/components.tsx` (Dashboard ma własne kafle, nie ma wspólnego `KpiCard`) |

### Karty w zakładce Przegląd (stan obecny, kolejność renderowania)

1. `SpendHero` + „Dlaczego tyle?" (`WhyBreakdown`)
2. „Ceny produktów" | „Ilości produktów" — grid 2 kol. od `md`
3. „Trend wydatków" — pełna szerokość, selektor 3/6/12 mies.
4. `CostCenterComparisonSection` — tylko gdy centra skonfigurowane
5. „Wydatki wg kategorii" | „Top dostawcy" — grid 2 kol.
6. „Krytyczne alerty" | „Rekomendacje AI" — grid 2 kol.
7. Empty state

---

## Korekty wobec planu v2 (WAŻNE — inaczej zrobimy duble albo regresję)

- **Etap „filtr centrum kosztów" jest w ~70% zrobiony.** Selektor centrum istnieje globalnie w headerze
  (`CostCenterProvider`), a `costCenterId` już leci do endpointów raportów. Do zrobienia zostaje wyłącznie:
  sticky pasek i zapis wyboru w URL. **Nie budować drugiego selektora.**
- **Hardkodowana mapa `COST_CENTER_COLORS` to REGRESJA.** Kolory są w bazie i użytkownik je edytuje;
  stała mapa rozjedzie się z ustawieniami i nie obsłuży centrów utworzonych przez użytkownika.
  Zamiast tego: helper czytający `useCostCenter().costCenters` i zwracający kolor po `id`.
- **Selektor miesiąca już przeniesiony** (2026-08-03): `MonthNavigator` ze strzałkami + ikona kalendarza
  z presetami i zakresem dat. Etap „przenieść selektor miesiąca" jest bezprzedmiotowy.
- **Kwoty są BRUTTO** w całych raportach (reguła 29 w `CLAUDE.md`). Nowe karty i kafle muszą to zachować,
  inaczej wrócą rozjazdy z ekranem Faktur.

---

## Etap 1 — Szerszy layout na web ✅ ZROBIONE (2026-08-04)

Kontener `max-w-5xl` (1024 px) → `max-w-[1600px]`, padding responsywny.

| Breakpoint | Szerokość | max-width | Padding | Grid par kart |
| --- | --- | --- | --- | --- |
| mobile | <768 px | 100% | 16 px | 1 kolumna |
| tablet | 768–1023 px | 100% | 24 px | 2 kolumny |
| desktop | 1024–1439 px | 100% | 40 px | 2 kolumny |
| wide | ≥1440 px | 1600 px | 40 px | 2 kolumny |

Zysk natychmiastowy: tabela Produktów (7 kolumn) i listy z długimi nazwami produktów przestają się ucinać.

---

## Etap 2 — Sticky pasek filtrów ✅ ZROBIONE (2026-08-04)

Nowy `ReportsFilterBar` pod nagłówkiem, nad zakładkami. `sticky top-0 z-20` + `backdrop-blur`
(wzorzec z `layout.tsx`). Zawartość: nawigator miesiąca + kalendarz (przenieść z nagłówka),
**istniejący** selektor centrum kosztów, eksporty CSV/Excel po prawej.

- Zapisać wybór centrum w query param (`?costCenter=<id>`) i czytać przy montowaniu — dziś stan
  jest tylko w kontekście + localStorage, więc link nie jest współdzielony.
- Na mobile `sticky` wyłączyć (pasek zjadłby ~30% ekranu) — zwykły scroll.

## Etap 3 — Hero (waterfall WYCOFANY 2026-08-05)

- Druga karta w hero: „Realny food cost" z `GET /api/reports/food-cost-ratio`. Renderować **tylko gdy
  `foodCostPct != null`** (lokale bez przychodu nie mają czego pokazać) — hero wraca wtedy do jednej karty.
- ~~Waterfall~~ — **sekcja „Dlaczego tyle" USUNIĘTA** (decyzja użytkownika, 2026-08-05).
  Powód: przy realnych danych zmiany to ułamek bazy (np. +207 zł przy 133 448 zł), więc
  słupki kroków miały 0,2–1,4 px i wykres był nieczytelny. Skalowanie od zera było błędem;
  gdyby sekcja miała wrócić, jedyne sensowne warianty to wykres SAMYCH zmian albo ucięta oś.

## Etap 4 — Kafle drugiego poziomu ✅ ZROBIONE (2026-08-04)

Rząd 4 klikalnych kafli (Centra / Kategorie / Dostawcy / Produkty): wartość główna, mini-wykres, link
do zakładki. Grid: 4 kol. ≥1440 px, 2 kol. 768–1439 px, 1 kol. mobile. Klik przełącza `setTab(...)`
bez przeładowania.

## Etap 5 — Scalenie „Ceny" + „Ilości" ✅ ZROBIONE (2026-08-04)

Dwie karty → jedna „Największe zmiany": max 5 wierszy, kolumny Produkt | Cena +Δ% | Ilość +Δ% | Koszt,
sortowanie po `|Δ koszt|` malejąco. Link „Zobacz wszystkie" → zakładka Produkty z aktywnym sortowaniem.
Dane są już w `bridge.priceBenchmark` i `bridge.quantityMovers` — trzeba je złączyć po kluczu produktu.

## Etap 6 — Spójne kolory centrów ✅ ZROBIONE (2026-08-04)

Helper (np. `lib/cost-center-color.ts`) czytający kolory z kontekstu, użyty w: `CostCenterComparisonSection`,
kaflu „Centra kosztów", selektorze w pasku filtrów. **Bez hardkodowanej palety.**

## Etap 7 — QA

Zweryfikowane statycznie (kod, typecheck, testy, build):

- [x] Eksport CSV i Excel — **kod nietknięty**, te same wywołania i parametry (`from`/`to` + `costCenterId`)
- [x] Zmiana centrum przelicza wszystko — wszystkie hooki czytają `costCenterId` z kontekstu
- [x] Empty state — Przegląd bez zmian, dodany osobny dla zakładki Centra
- [x] Kwoty BRUTTO — reguła 29 nietknięta (18 miejsc z `vat_rate` w `routes/reports.ts`)
- [x] `pnpm run typecheck` czysty, 87 testów przechodzi, build OK (chunk `reports` 105 kB / 17 kB gzip)

Do sprawdzenia w przeglądarce (nie da się statycznie):

- [ ] Responsywność: 1920 / 1440 / 1024 / 768 / 375 px
- [ ] Sticky pasek nie zasłania treści pod mobilnym headerem (`fixed`, h-14)
- [ ] `?costCenter=` przywraca filtr po odświeżeniu i po wklejeniu linku
- [ ] Zgodność liczb z wersją sprzed zmian na tych samych danych (lipiec 2026)

---

## Kolejność wdrożenia

1. ~~Etap 0 — rozpoznanie~~ ✅
2. ~~Etap 1 — szerokość~~ ✅ (najniższe ryzyko, osobny commit)
3. Etap 5 — scalenie tabel (czysty front, bez zmian API)
4. Etap 3 — hero + waterfall (wizualne, niezależne)
5. Etap 4 — kafle L2 (zależne od Etapu 1)
6. Etap 2 — sticky bar + URL param
7. Etap 6 — kolory (po Etapie 2)
8. Etap 7 — QA całości
