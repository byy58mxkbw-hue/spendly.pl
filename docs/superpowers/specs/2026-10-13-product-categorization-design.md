# Specyfikacja: Nowa taksonomia kategorii produktów Spendly

**Data:** 2026-10-13  
**Autor:** Claude Code  
**Status:** Gotowy do implementacji

---

## Kontekst

Analiza 5 348 unikalnych nazw produktów z bazy produkcyjnej (3,75 mln PLN spend) wykazała 16,5% błędnej kategoryzacji (619k PLN). Główne przyczyny:
1. Silnik dopasowywał przymiotniki zamiast rzeczownika głównego (np. „maślana" bułka → nabial)
2. Brak kategorii `syropy`, `biuro`, `kaucje`, `naprawy`
3. Brakujące słowa kluczowe (Miruna, Primerba, gnocchi jako makaron, lód jako napój)

## Decyzja projektowa

Podejście 1 (zaakceptowane przez użytkownika):
- Cleanup taksonomii + nowe kategorie
- Tryb przeglądu posortowany wg wpływu finansowego
- Bulk „zastosuj do podobnych"
- Uczenie z korekt użytkownika

---

## Nowa taksonomia (33 kategorie)

### ŻYWNOŚĆ (11)
| ID | Nazwa |
|----|-------|
| `miesa` | Mięso i wędliny |
| `ryby` | Ryby i owoce morza |
| `warzywa` | Warzywa, grzyby, ziemniaki i świeże zioła |
| `owoce` | Owoce (świeże, mrożone, puree cukiernicze) |
| `nabial` | Nabiał i jaja |
| `sery` | Sery |
| `pieczywo` | Pieczywo, mąka, makarony i zboża |
| `przyprawy` | Przyprawy, sosy, oleje i dodatki |
| `slodycze` | Słodycze i desery |
| `orzechy` | Orzechy, bakalie i nasiona |
| `spozywcze_inne` | Półprodukty i inne spożywcze |

### NAPOJE I BAR (4)
| ID | Nazwa |
|----|-------|
| `napoje` | Napoje bezalkoholowe (w tym piwo 0%, lód) |
| `kawa_herbata` | Kawa i herbata |
| `syropy` | Syropy i dodatki barowe (Monin, CO2, puree barowe) |
| `alkohole` | Alkohole |

### ZAOPATRZENIE LOKALU (3)
| ID | Nazwa |
|----|-------|
| `opakowania` | Opakowania i jednorazowe |
| `chemia` | Chemia i środki czystości |
| `sprzet` | Sprzęt, naczynia i wyposażenie lokalu |

### KOSZTY FIRMY (9)
| ID | Nazwa |
|----|-------|
| `media` | Media (energia, gaz, woda) |
| `paliwo` | Paliwo |
| `czynsz_leasing` | Czynsz, najem i leasing |
| `uslugi` | Usługi, abonamenty i opłaty |
| `it_elektronika` | IT i elektronika |
| `pojazdy` | Pojazdy |
| `naprawy` | Naprawy i serwis lokalu |
| `biuro` | Biuro, druk i materiały do kasy |
| `kaucje` | Kaucje i opakowania zwrotne |

### BUDOWA I TARTAK (5)
| ID | Nazwa |
|----|-------|
| `drewno` | Drewno |
| `materialy_budowlane` | Materiały budowlane |
| `instalacje` | Instalacje i elektryka |
| `maszyny_narzedzia` | Maszyny, narzędzia i części |
| `uslugi_budowlane` | Usługi budowlane |

### INNE (1)
| ID | Nazwa |
|----|-------|
| `inne` | Inne (tylko gdy naprawdę nic nie pasuje) |

---

## Zasady klasyfikacji (do zakodowania w silniku)

### Zasada 1: CZYM jest produkt (nie skąd ani gdzie)
- „mrożone frytki" → `warzywa`
- „tuńczyk w puszce" → `ryby`
- Coca-Cola kupiona przez centrum TARTAK → `napoje`

### Zasada 2: Rzeczownik główny, nie przymiotnik
- „bułka hamburger **maślana**" → `pieczywo` (nie nabial)
- „kuweta **waniliowa** 5L" → `slodycze` (nie przyprawy)

### Zasada 3: OPAK/opakowanie w nazwie spożywczej = rozmiar
- „GROSZEK OPAK" → `warzywa` (nie opakowania)
- „COLA 24OPAK" → `napoje` (nie opakowania)

### Zasada 4: Rozstrzygnięcia graniczne
- Alkohol 0% (piwo, wino, gin) → `napoje`
- Puree barowe (Monin, Rioba, Lord of Taste koktajlowe) → `syropy`
- Puree cukiernicze (Boiron, Ponthier, Profimator) → `owoce`
- CO2 / dwutlenek węgla do nalewaków → `syropy`
- Lód w kostkach → `napoje`
- Gnocchi, ravioli, tortellini, cappelletti → `pieczywo`
- Glony nori, wakame → `warzywa`
- Cebula suszona → `przyprawy` (nie warzywa)
- Mieszanka kompotowa (bakalie) → `orzechy`
- Bitters z alkoholem (Angostura, Bitter Truth) → `alkohole`
- Najem tablicy reklamowej → `uslugi` (reklama)
- Najem/dzierżawa terminala/kasy → `czynsz_leasing`
- Paliwo gazowe (myORLEN kWh) → `paliwo` (nie media)
- Robot sprzątający → `it_elektronika` (nie sprzet)
- Rolki termiczne/paragonowe → `biuro` (nie it_elektronika)
- Karma dla zwierząt, wpisy testowe → `inne`

---

## Zmiany w pliku `lib/category-rules/src/rules.ts`

### Nowe kategorie do dodania

**`syropy`** (nowa)
```
keywords: monin, rioba, da vinci, lord of taste, pureco, syrop, barmański, barowy,
          co2, dwutlenek węgla, nabój do syfonu, bitter, curacao bezalkoh,
          liquid, falernum, orgeat, grenadyna, tonik barowy
excluded_if: angostura, bitter truth (te → alkohole gdy conf alkoholu)
```

**`kaucje`** (nowa)
```
keywords: kaucja, drs, zwrot kaucji, opakowanie zwrotne, keg zwrotny,
          butelka zwrotna, skrzynka zwrotna, paleta zwrotna, transporter zwrotny
```

**`biuro`** (nowa)
```
keywords: rolka termiczna, rolka paragonowa, papier ksero, koperta, 
          marker do tablicy, segregator, naklejka, wizytówka, druk menu,
          ulotka, papier wizytówkowy, toner do drukarki
```

**`naprawy`** (nowa)
```
keywords: naprawa, serwis urządzenia, konserwacja ekspresu, przegląd zmywarki,
          konserwacja klimatyzacji, przegląd instalacji
```

### Korekty istniejących kategorii

**`pieczywo`** — dodać: gnocchi, ravioli, tortellini, cappelletti, lasagne, kopytka,
  pierogi (gotowe ciasto), kluski śląskie

**`napoje`** — dodać: lód w kostkach, piwo bezalkoholowe, 0.0, 0%, gin 0%,
  wino bezalkoholowe

**`warzywa`** — usunąć: cebula suszona, czosnek granulowany (przechodzą do `przyprawy`)
  Zachować: cebula świeża, czosnek świeży

**`owoce`** — dodać: profimator, boiron, ponthier (puree cukiernicze)

**`syropy`** — dodać: monin puree (barowe), co2, dwutlenek, nabój syfon

**`alkohole`** — dodać: angostura, bitter truth, bitter chocolate bitters
  (bitters z zawartością alkoholu)

**`media`** — wykluczyć: „paliwo gazowe" (→ paliwo), „opłata handlowa stacja" (→ uslugi)

**`uslugi`** — dodać: najem tablicy reklamowej, tablica reklamowa najem

**`czynsz_leasing`** — dodać: najem terminala, dzierżawa terminala, dzierżawa kasy,
  dzierżawa pos, najem pos

**`it_elektronika`** — dodać: robot sprzątający, zigbee, bramka smart, regulator
  inteligentny, włącznik dotykowy

**`przyprawy`** — dodać: cebula suszona, czosnek granulowany, cebulka prażona,
  peperonata (gotowy sos)

**`orzechy`** — dodać: mieszanka kompotowa (suszone owoce, bakalie)

---

## Migracja istniejących produktów w bazie

### Problem
Tabela `invoice_items` i `products` ma aktualnie kategorie z starego silnika.
Po zmianie `rules.ts` nowe fakturki będą kategoryzowane poprawnie, ale stare nie.

### Rozwiązanie: jednorazowy backfill
1. Po wdrożeniu nowego silnika: uruchom re-kategoryzację dla WSZYSTKICH istniejących
   produktów (bez korekty manualnej użytkownika — te mają priorytet Z1).
2. Backfill odbywa się jako job przy starcie serwera (`ensurePreListenColumns`-style).
3. Loguje ile produktów zostało zmienionych.

### Priorytety (istniejąca logika Z1–Z9, zachowana)
- Z1: ręczna korekta użytkownika → NIE nadpisuj
- Z2: propagacja na duplikaty
- Z3: własne kategorie użytkownika
- Z4–Z9: automatyczna kategoryzacja (słowa kluczowe → AI)

---

## UI: tryb przeglądu kategorii

### Lista „Błędne kategorie" (nowa zakładka w /products lub modal)

Kryteria wyświetlania:
- Produkty gdzie stara kategoria ≠ nowa sugerowana kategoria
- Posortowane malejąco wg spend
- Filtr po kategorii źródłowej / docelowej

Każdy wiersz:
```
[Stara kat]  →  [Nowa kat]     Nazwa produktu         Spend   Podobnych
[warzywa  ]  →  [przyprawy]    CEBULA ŻÓŁTA SUSZONA   801 PLN    3
```

Akcje:
- **Akceptuj** (zmień tę pozycję)
- **Akceptuj wszystkie podobne** (bulk: te same słowa kluczowe → ta sama korekta)
- **Zostaw jak jest** (odrzuć sugestię, zapisz jako ręczna korekta)

### Uczenie
- Akceptacja → `product_corrections` (Z1 dla tego użytkownika)
- „Akceptuj podobne" → propagacja na produkty z >= 80% podobieństwem nazwy

---

## Pliki do zmiany

```
lib/category-rules/src/rules.ts          ← główne zmiany (nowe kategorie, keywords)
lib/category-rules/src/categorize.ts     ← head-noun matching (rzeczownik główny)
artifacts/api-server/src/services/       ← backfill service
artifacts/api-server/src/routes/products.ts ← endpoint sugestii zmian kategorii
artifacts/ksef-monitor/src/pages/products/ ← UI trybu przeglądu
lib/api-spec/openapi.yaml                ← nowe endpointy (GET /products/category-review)
```

---

## Fazy wdrożenia

### Faza 1 (krytyczna): Nowy silnik kategoryzacji
1. Dodać nowe kategorie do `rules.ts` z pełnymi keyword lists
2. Naprawić head-noun matching w `categorize.ts`
3. Testy jednostkowe dla nowych zasad
4. `pnpm run typecheck`

### Faza 2: Backfill istniejących produktów
1. Job backfill przy starcie serwera (jednorazowy, idempotentny)
2. Logi ile zmieniono
3. Deploy

### Faza 3: UI przeglądu
1. Endpoint `GET /products/category-review` → lista sugestii zmian
2. `PATCH /products/:id/category` → akceptacja (już istnieje?)
3. Frontend: zakładka lub modal w /products

---

## Metryki sukcesu
- Produkty w kategorii `inne`: ≤ 5 (teraz 38, z czego 35 to demo/testowe)
- Low-confidence: ≤ 20 (teraz 20 — cel osiągnięty)
- 619k PLN w złych kategoriach → poniżej 100k PLN po backfill
