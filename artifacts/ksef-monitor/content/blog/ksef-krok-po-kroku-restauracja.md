---
slug: ksef-krok-po-kroku-restauracja
title: KSeF krok po kroku — jak przygotować restaurację (praktyczny przewodnik)
description: Konkretna lista kroków wdrożenia KSeF w restauracji: uprawnienia, token, odbieranie faktur zakupowych i co zrobić, gdy system nie odpowiada.
date: 2026-08-10
updated: 2026-08-10
category: KSeF
keywords: KSeF krok po kroku, jak wdrożyć KSeF w restauracji, token KSeF, uprawnienia KSeF, KSeF instrukcja gastronomia
lead: Nie potrzebujesz kursu ani wdrożeniowca. Poniżej masz kolejność działań, którą przechodzi się raz i ma spokój — plus miejsca, w których najczęściej coś się zacina.
---

## Zanim zaczniesz — trzy rzeczy pod ręką

- **NIP firmy** (ten, na który przychodzą faktury zakupowe),
- **sposób uwierzytelnienia** — podpis kwalifikowany, pieczęć kwalifikowana albo Profil Zaufany osoby uprawnionej,
- **decyzja, kto ma dostęp** — właściciel, księgowa, manager. To ważne, bo uprawnienia nadaje się imiennie.

Jeśli prowadzisz kilka lokali na jednym NIP, wystarczy jedna konfiguracja. Osobne spółki = osobne wdrożenia.

## Krok 1. Wejdź do systemu jako podmiot

Logujesz się do KSeF jako firma (nie jako osoba prywatna) i uwierzytelniasz jednym z powyższych sposobów. Właściciel jednoosobowej działalności ma uprawnienia właścicielskie automatycznie — spółka wymaga wskazania osoby uprawnionej.

## Krok 2. Nadaj uprawnienia ludziom, nie „firmie"

To najczęstsze potknięcie. Uprawnienia w KSeF są **imienne**:

- **dostęp do faktur zakupowych** — tego potrzebujesz do kontroli kosztów,
- **wystawianie faktur** — jeśli fakturujesz gości biznesowych czy imprezy,
- **zarządzanie uprawnieniami** — trzymaj wąsko, najlepiej tylko właściciel.

Księgowej nadaj dostęp osobno, zamiast dzielić się swoim logowaniem. Gdy zmieni się biuro rachunkowe, odbierasz jedno uprawnienie zamiast zmieniać wszystko.

## Krok 3. Wygeneruj token do integracji

Token to długi ciąg znaków, który pozwala programowi łączyć się z KSeF w Twoim imieniu — bez podpisu przy każdym pobraniu faktur. Zasady, przy których nie ma problemów:

- generujesz token **o najwęższym potrzebnym zakresie** (do odbierania faktur nie potrzeba uprawnień do wystawiania),
- **zapisujesz go od razu** — pełnej wartości zwykle nie da się podejrzeć drugi raz,
- **nie wysyłasz go mailem ani komunikatorem**; program, który go przyjmuje, powinien go szyfrować (w [Spendly](/ksef) token jest szyfrowany AES-256-GCM, a w interfejsie widać tylko cztery ostatnie znaki),
- gdy token wycieknie albo odejdzie osoba, która go generowała — **unieważniasz i wystawiasz nowy**.

## Krok 4. Podłącz odbieranie faktur zakupowych

Tu zaczyna się realna korzyść. Faktury od dostawców trafiają do KSeF automatycznie, w formie **danych**, nie skanów: każda pozycja ma nazwę, ilość, jednostkę, cenę netto i stawkę VAT. To znaczy, że możesz z nich liczyć [food cost](/blog/jak-liczyc-food-cost) i [monitorować ceny](/blog/monitorowanie-cen-surowcow) bez przepisywania czegokolwiek.

Ustaw **datę początkową pobierania**. Warto sięgnąć wstecz o kilka miesięcy — dopiero historia daje porównania „ta cena vs poprzedni okres".

## Krok 5. Sprawdź, co przyszło

Po pierwszym pobraniu przejrzyj listę i zweryfikuj trzy rzeczy:

1. **Czy są wszyscy dostawcy?** Jeśli kogoś brakuje, prawdopodobnie wystawia faktury poza KSeF albo na inny NIP.
2. **Czy pozycje mają sensowne nazwy?** Ten sam produkt bywa nazywany różnie w kolejnych miesiącach — to normalne i warto go raz uporządkować.
3. **Czy kwoty się zgadzają z tym, co płacisz?** Pamiętaj, że pozycje są netto, a kwota do zapłaty brutto — o tej pułapce pisaliśmy w tekście o [VAT w gastronomii](/blog/vat-w-gastronomii).

## Gdy coś nie działa

- **„Brak uprawnień"** — token wygenerowany na innym zakresie albo osoba straciła uprawnienia. Sprawdź w panelu KSeF, nie w programie.
- **System nie odpowiada / limity zapytań** — KSeF potrafi ograniczyć częstotliwość odpytywania. Rozsądny program czeka i próbuje później, zamiast dobijać się co sekundę. Nie ma sensu klikać „synchronizuj" w kółko.
- **Faktura jest w KSeF, ale jej nie widzisz** — sprawdź zakres dat pobierania i czy dostawca wystawił ją na Twój NIP, a nie na inny podmiot z grupy.
- **Duplikaty** — ta sama faktura zaimportowana dwa razy zaburza koszty. Dobry system rozpoznaje duplikaty po numerze i dostawcy.

## Co zyskujesz, gdy to już stoi

Papier znika, ale to nie jest największa korzyść. Najważniejsze jest to, że **ceny surowców stają się danymi**: widzisz, że filet zdrożał o 8% między dostawami, zanim zobaczysz to w rachunku wyników. [Spendly](/food-cost) pobiera faktury z KSeF, buduje historię cen każdego produktu i alarmuje przy przekroczeniu progu — a Ty decydujesz, czy negocjować, zmienić dostawcę czy skorygować kartę.

> Wdrożenie to jedno popołudnie: uwierzytelnienie, uprawnienia imienne, wąski token, data początkowa i weryfikacja pierwszej paczki faktur. Potem system pracuje sam.
