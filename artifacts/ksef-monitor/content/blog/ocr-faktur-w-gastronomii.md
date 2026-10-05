---
slug: ocr-faktur-w-gastronomii
title: OCR faktur w gastronomii — jak działa automatyczne odczytywanie faktur od dostawców
description: OCR faktur w gastronomii: jak zdjęcie lub PDF faktury zamienia się w dane o kosztach bez przepisywania i kiedy uzupełnia KSeF.
date: 2026-09-27
updated: 2026-10-05
category: Operacje
keywords: OCR faktur, OCR faktur w gastronomii, automatyczne odczytywanie faktur, skanowanie faktur restauracja, faktura ze zdjęcia
lead: Dostawca zostawia papierową fakturę przy dostawie, kurier podaje PDF mailem, a Ty i tak masz to ręcznie wpisać do arkusza. OCR faktur zdejmuje z Ciebie tę robotę — sprawdź, jak to realnie działa.
---

## Dlaczego KSeF nie rozwiązuje wszystkiego

KSeF obsługuje faktury ustrukturyzowane, wystawione i przesłane przez system — i to działa dobrze, gdy oba podmioty faktycznie z niego korzystają. W praktyce gastronomii wciąż zdarzają się sytuacje, w których faktura nie trafia do KSeF w wygodnej, gotowej do odczytu formie: mały lokalny dostawca warzyw wystawia papierowy dokument przy dostawie, hurtownia wysyła PDF mailem zamiast przez system, albo pozycja z paragonu trzeba dopisać ręcznie po zakupach uzupełniających. [KSeF](/ksef) rozwiązuje jedną część problemu — import faktur, które faktycznie są w systemie. OCR rozwiązuje drugą: wszystko, co przychodzi poza nim.

## Jak działa OCR faktur w praktyce

Mechanizm jest prosty z perspektywy użytkownika, mimo że w tle dzieje się więcej: robisz zdjęcie telefonem albo wgrywasz PDF, a system w kilkanaście sekund rozpoznaje strukturę dokumentu — nie tylko sam tekst, ale to, CZYM poszczególne fragmenty są. Odczytane zostają:

- nazwa i NIP dostawcy,
- numer faktury i data wystawienia,
- pozycje: nazwa produktu, ilość, jednostka, cena jednostkowa, wartość,
- stawki VAT przy każdej pozycji.

Różnica względem zwykłego OCR-u (czyli "zamiana obrazu na tekst") jest istotna: samo rozpoznanie tekstu z faktury da Ci nieuporządkowany ciąg znaków, który i tak trzeba ręcznie posegregować na pozycje. Dobry OCR faktur rozumie UKŁAD dokumentu — wie, że kolumna z liczbami po prawej stronie wiersza to cena, a nie kolejny fragment nazwy produktu.

## Co dzieje się z danymi po odczytaniu

Sam odczyt to połowa historii. Druga połowa to co system robi z rozpoznanymi pozycjami:

1. **Dopasowanie do istniejących produktów.** Jeśli już kupujesz "Pomidor malinowy luz" od tego dostawcy, nowa pozycja z faktury trafia do tego samego produktu — zamiast tworzyć duplikat przy każdej literówce czy innym zapisie nazwy.
2. **Kategoryzacja.** Nowe pozycje dostają automatycznie przypisaną kategorię (np. Warzywa, Nabiał), więc od razu wchodzą do [rozbicia kosztów wg kategorii](/food-cost) bez ręcznego porządkowania.
3. **Historia cen.** Odczytana cena jednostkowa dokłada się do historii tego produktu — dokładnie tak samo, jakby faktura przyszła przez KSeF. Z perspektywy [monitorowania cen surowców](/blog/monitorowanie-cen-surowcow) nie ma znaczenia, czy dana cena pochodzi z importu elektronicznego, czy ze zdjęcia — liczy się, że jest w systemie.

## Kiedy to naprawdę oszczędza czas

Największa różnica jest odczuwalna nie przy jednej fakturze, tylko przy rutynie. Restauracja kupująca codziennie od kilku małych dostawców (piekarnia, lokalny warzywniak, dostawca ryb) zbiera tygodniowo kilkanaście-kilkadziesiąt dokumentów, z których część nigdy nie trafi do KSeF w wygodnej formie. Ręczne przepisanie każdej pozycji do arkusza to praca, którą ktoś musi wykonać — zwykle po godzinach, zwykle z błędami przy przepisywaniu cen. OCR nie eliminuje potrzeby weryfikacji (zawsze warto rzucić okiem, czy odczyt się zgadza), ale zamienia "przepisywanie od zera" na "szybkie sprawdzenie gotowego wyniku".

## Co zrobić z fakturą, której OCR nie odczyta idealnie

Żaden OCR nie jest nieomylny — wyblakły papierowy paragon, poplamiona faktura czy nietypowy układ dokumentu od małego dostawcy mogą dać niepełny odczyt. Dobra praktyka: traktuj OCR jako punkt startowy, nie ostateczny wynik. Pozycja, której system nie rozpozna pewnie, powinna trafić do kolejki do ręcznej weryfikacji — a nie zniknąć albo wejść do bazy z błędną ceną, która później zafałszuje [raport zmian cen](/blog/monitorowanie-cen-surowcow).

## OCR jako uzupełnienie, nie zamiennik KSeF

Najlepiej myśleć o tym jako o dwóch strumieniach zasilających tę samą bazę: KSeF dla faktur ustrukturyzowanych, OCR dla wszystkiego, co przychodzi papierowo, mailem albo w PDF-ie bez ustrukturyzowanych danych. Dopiero razem dają pełny obraz — bo [food cost](/blog/jak-liczyc-food-cost) policzony na podstawie połowy faktur (tylko tych z KSeF) systematycznie zaniża rzeczywiste koszty o wszystko, co przyszło inną drogą.

[Spendly](/ocr-faktur) czyta faktury ze zdjęcia lub PDF w około 15 sekund i od razu dokłada je do tej samej bazy co import z [KSeF](/ksef) — bez podwójnej pracy i bez dwóch osobnych źródeł prawdy o kosztach.

> Faktura, która nie trafiła do KSeF, nie przestaje być kosztem — po prostu łatwiej ją przeoczyć. OCR nie zastępuje uważności, ale zdejmuje z Ciebie najbardziej żmudną część: przepisywanie liczb.

## Najczęstsze pytania

### Co to jest OCR faktur?

To automatyczne odczytanie danych ze zdjęcia lub skanu faktury: dostawcy i NIP-u, numeru i daty, pozycji z ilościami i cenami oraz stawek VAT.

### Po co OCR, skoro jest KSeF?

Nie każda faktura trafia do KSeF. Zakupy na paragon, faktury od mniejszych dostawców czy dokumenty papierowe trzeba wprowadzić inaczej, a OCR zdejmuje z Ciebie przepisywanie liczb.

### Co dzieje się z danymi po odczytaniu faktury?

Pozycje są dopasowywane do istniejących produktów, dostają kategorię i dokładają się do historii cen, tak samo jak faktury z KSeF.

### Co zrobić, gdy OCR źle odczyta fakturę?

Sprawdzić odczyt przed zapisem, zwłaszcza NIP, numer faktury i kwoty, i poprawić błędy. Wyraźne zdjęcie całej faktury znacznie zmniejsza liczbę pomyłek.

### Czy można zeskanować fakturę z kilkoma stronami?

Tak. W Spendly możesz dodać kilka zdjęć albo plik PDF, a wszystkie strony zostaną odczytane jako jedna faktura.
