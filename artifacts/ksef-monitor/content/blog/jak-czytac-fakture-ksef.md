---
slug: jak-czytac-fakture-ksef
title: Jak czytać fakturę z KSeF — pola FA(3) krok po kroku
description: Faktura z KSeF ma format XML FA(3), nie PDF. Wyjaśniamy najważniejsze pola — sprzedawca, nabywca, pozycje, stawki VAT — i pokazujemy, jak wyciągnąć z nich dane o kosztach.
date: 2026-07-14
updated: 2026-07-14
category: KSeF
keywords: jak czytać fakturę KSeF, faktura FA(3), pola faktury KSeF, struktura faktury KSeF, XML faktura KSeF
lead: Faktura z KSeF to nie PDF, tylko ustrukturyzowany plik XML w formacie FA(3). Brzmi technicznie, ale w praktyce to uporządkowany zestaw pól. Pokazujemy, co gdzie jest i jak to czytać.
---

## Faktura z KSeF wygląda inaczej niż zwykła

Do faktury z Krajowego Systemu e-Faktur nie dostajesz ładnego PDF-a. Dostajesz **plik XML w formacie FA(3)** — ustrukturyzowany zapis, w którym każda informacja ma swoje ściśle określone pole. To niewygodne do czytania okiem, ale idealne dla programów: dane da się przetworzyć automatycznie, bez zgadywania.

Większość systemów (w tym KSeF) potrafi wyświetlić taki plik jako czytelną wizualizację. Warto jednak wiedzieć, co kryje się pod spodem — bo to te pola decydują, jak Twoje koszty trafią do analizy.

## Główne sekcje faktury FA(3)

### 1. Nagłówek (dane faktury)
Podstawowe informacje o dokumencie:
- **Numer faktury** — unikalny identyfikator nadany przez sprzedawcę
- **Data wystawienia** i **data sprzedaży** (mogą się różnić)
- **KodFormularza** = `FA` i **WariantFormularza** = `3` (wersja schematu)
- **Numer KSeF** — identyfikator nadany przez system po przyjęciu faktury

### 2. Sprzedawca (Podmiot1)
Kto wystawił fakturę — dla restauracji to zwykle dostawca:
- **NIP** sprzedawcy
- **Nazwa** firmy
- Adres

### 3. Nabywca (Podmiot2)
Czyli Ty:
- **NIP** nabywcy — po tym KSeF przypisuje fakturę do Twojej firmy
- Nazwa i adres

> W niektórych fakturach pojawia się też **Podmiot3** — np. odbiorca końcowy albo miejsce dostawy (konkretny lokal). To pole bywa cenne przy sieci restauracji, bo pozwala przypisać koszt do właściwej lokalizacji.

### 4. Pozycje faktury (FaWiersz)
Najważniejsza część dla kontroli kosztów — lista produktów. Każdy wiersz zawiera:
- **NazwaTowaru** — opis pozycji (np. „Pierś z kurczaka")
- **Ilosc** (`Ilosc`) i **jednostka miary** (`JednostkaMiary` — kg, szt, l)
- **CenaJednostkowa** netto
- **Wartosc** netto pozycji
- **StawkaPodatku** — stawka VAT (np. 23%, 8%, 5%, 0%)

### 5. Podsumowanie i płatność
- Sumy netto, VAT i brutto w rozbiciu na stawki
- **Forma płatności** i **termin**
- Numer rachunku bankowego

<figure class="diagram">
<svg role="img" aria-labelledby="faT faD" viewBox="0 0 420 268">
<title id="faT">Struktura faktury KSeF w formacie FA(3)</title>
<desc id="faD">Faktura FA(3) składa się z sekcji: nagłówek z numerem i datami, sprzedawca (Podmiot1), nabywca (Podmiot2), pozycje faktury (FaWiersz — najważniejsze dla kontroli kosztów: produkty, ilości, ceny), oraz podsumowanie i płatność.</desc>
<rect x="40" y="10" width="340" height="42" rx="7" fill="#2a3542"/>
<rect x="40" y="58" width="340" height="42" rx="7" fill="#2a3542"/>
<rect x="40" y="106" width="340" height="42" rx="7" fill="#2a3542"/>
<rect x="40" y="154" width="340" height="42" rx="7" fill="#3DDC97"/>
<rect x="40" y="202" width="340" height="42" rx="7" fill="#2a3542"/>
<text x="56" y="36" fill="#F5F7FA" font-family="sans-serif" font-size="13" font-weight="700">Nagłówek — numer, daty, nr KSeF</text>
<text x="56" y="84" fill="#F5F7FA" font-family="sans-serif" font-size="13" font-weight="700">Sprzedawca — Podmiot1 (dostawca)</text>
<text x="56" y="132" fill="#F5F7FA" font-family="sans-serif" font-size="13" font-weight="700">Nabywca — Podmiot2 (Ty)</text>
<text x="56" y="174" fill="#06231a" font-family="sans-serif" font-size="13" font-weight="800">Pozycje — FaWiersz</text>
<text x="56" y="190" fill="#06231a" font-family="sans-serif" font-size="11">produkty, ilości, ceny jednostkowe, VAT</text>
<text x="56" y="228" fill="#F5F7FA" font-family="sans-serif" font-size="13" font-weight="700">Podsumowanie i płatność</text>
</svg>
<figcaption>Sekcje faktury FA(3). Dla kontroli kosztów najważniejsze są pozycje (FaWiersz) — nazwa, ilość, jednostka i cena.</figcaption>
</figure>

## Co jest najważniejsze przy kontroli kosztów

Z perspektywy restauracji kluczowe są **pola pozycji** (`FaWiersz`): nazwa, ilość, jednostka i cena jednostkowa. To z nich buduje się historię cen surowców. Dwie pułapki, na które trzeba uważać:

1. **Jednostki miary.** Ten sam produkt raz bywa fakturowany w kg, raz w opakowaniach czy sztukach. Bez normalizacji jednostek porównanie cen wychodzi bez sensu (fałszywy „skok ceny").
2. **Ceny netto vs brutto.** Do analizy kosztów i food cost używa się kwot **netto** — VAT nie jest Twoim kosztem, jeśli go odliczasz.

## Ręczne czytanie nie skaluje się

Przy kilku fakturach miesięcznie da się to ogarnąć okiem. Przy kilkudziesięciu dostawcach i setkach pozycji — już nie. Wartość KSeF nie polega na tym, że faktura jest w XML, tylko na tym, że **te dane da się automatycznie przetworzyć**.

[Spendly](/ksef) pobiera faktury z KSeF przez oficjalne API, parsuje pola FA(3), normalizuje jednostki i zamienia surowy XML w gotową analizę: historię cen każdego surowca, porównanie dostawców i [food cost](/blog/jak-liczyc-food-cost) liczony automatycznie. Zamiast czytać XML, patrzysz na to, co z niego wynika — gdzie rosną koszty i u kogo kupujesz najtaniej.

Jeśli dopiero przygotowujesz lokal do KSeF, zacznij od: [KSeF dla restauracji — od kiedy obowiązkowy](/blog/ksef-dla-restauracji-od-kiedy-obowiazkowy).
