---
slug: menu-engineering-restauracja
title: Menu engineering — gwiazdy, konie pociągowe, zagadki i psy
description: Menu engineering dzieli dania na cztery grupy według marży i popularności. Pokazujemy, jak zrobić tę analizę na własnych danych i co konkretnie zrobić z każdą z czterech grup.
date: 2026-09-04
updated: 2026-09-04
category: Menu
keywords: menu engineering, analiza menu restauracja, macierz menu, rentowność dań, marża jednostkowa danie
lead: Najczęstszy błąd w karcie to usuwanie dań, które „mało zarabiają procentowo". Menu engineering pokazuje, dlaczego to rozumowanie potrafi wyciąć z karty danie, które utrzymuje lokal.
---

## Dwie liczby, na których stoi cała analiza

Menu engineering to metoda opracowana w latach 80. przez Michaela Kasavanę i Donalda Smitha. Ocenia każde danie w dwóch wymiarach:

- **Popularność** — ile sztuk sprzedało się w danym okresie
- **Marża jednostkowa** — cena sprzedaży minus koszt surowców, w złotych, nie w procentach

Drugi punkt jest tym, co odróżnia menu engineering od zwykłego liczenia food costu. Danie o food cost 40% brzmi gorzej niż danie o food cost 25% — ale jeśli pierwsze zostawia 46 zł marży, a drugie 9 zł, to pierwsze utrzymuje lokal, a drugie tylko ładnie wygląda w zestawieniu.

Do banku nosisz złotówki, nie procenty.

## Cztery ćwiartki

Dania dzieli się względem dwóch progów: średniej marży ważonej sprzedażą i progu popularności (klasycznie: 70% podzielone przez liczbę pozycji w karcie).

| | Wysoka marża | Niska marża |
| --- | --- | --- |
| **Wysoka sprzedaż** | Gwiazdy | Konie pociągowe |
| **Niska sprzedaż** | Zagadki | Psy |

**Gwiazdy** — sprzedają się i zarabiają. Nic z nimi nie rób poza pilnowaniem jakości i kosztu surowca. To one płacą czynsz. Nie podnoś im ceny odruchowo: gwiazda to często danie, po które ludzie przychodzą, i jest najbardziej wrażliwe na zmianę ceny.

**Konie pociągowe** — sprzedają się świetnie, ale marża jest cienka. Klasyk: burger, schabowy, zestaw lunchowy. Nie usuwaj ich — ściągają ludzi. Zamiast tego szukaj kilku złotych w koszcie porcji: gramatura, tańszy zamiennik dodatku, inny dostawca tego samego surowca. Przy 300 sztukach miesięcznie 2 zł oszczędności to 600 zł, a gość niczego nie zauważy.

**Zagadki** — wysoka marża, mało sprzedaży. Danie zarabia, tylko nikt go nie zamawia. Zanim je wytniesz, sprawdź, czy problem nie leży w opisie, w miejscu na karcie albo w nazwie. Zagadki to jedyna ćwiartka, w której zmiana samego menu — bez zmiany kuchni — potrafi realnie podnieść wynik ([psychologia cen w menu](/blog/psychologia-cen-w-menu)).

**Psy** — nie sprzedają się i nie zarabiają. Kandydaci do usunięcia. Zanim to zrobisz, sprawdź jedno: czy danie nie dzieli surowca z czymś, co sprzedaje się dobrze. Pozycja, która zużywa resztę polędwicy, bywa warta więcej niż wynika z jej własnej sprzedaży.

## Jak to policzyć na swoich danych

Potrzebujesz trzech rzeczy:

1. **Ilość sprzedanych sztuk** per pozycja — z raportu POS za konkretny miesiąc
2. **Cenę sprzedaży** — z karty
3. **Koszt porcji** — z receptury, wyceniony po realnych cenach z faktur ([karta technologiczna](/blog/karta-technologiczna-dania))

Potem dla każdego dania liczysz marżę jednostkową i mnożysz przez sprzedaż. Suma tych iloczynów podzielona przez łączną sprzedaż daje **średnią marżę ważoną** — to Twój próg pionowy. Próg poziomy to 70% podzielone przez liczbę pozycji: przy 40 daniach wychodzi 1,75% udziału w sztukach.

Jedna pułapka rachunkowa: **cena z karty jest brutto, a koszt surowca z faktury netto**. Jeśli odejmiesz jedno od drugiego bez sprowadzenia do wspólnej podstawy, marża wyjdzie zawyżona o stawkę VAT — w gastronomii zwykle 8%. To wystarczy, żeby danie wskoczyło o ćwiartkę wyżej, niż na to zasługuje.

## Kiedy analiza kłamie

**Za krótki okres.** Jeden miesiąc to za mało przy daniach sezonowych. Karta letnia i zimowa to dwie różne analizy.

**Ceny surowców sprzed pół roku.** Receptura wyceniona po starych cenach pokazuje marżę, której już nie ma. Koszt porcji trzeba przeliczać po aktualnych fakturach, nie po tym, ile masło kosztowało w marcu ([monitorowanie cen](/blog/monitorowanie-cen-surowcow)).

**Niepełne pokrycie recepturami.** Jeśli masz receptury do połowy karty, macierz opisuje połowę lokalu i milczy o reszcie — a milczenie łatwo pomylić z „tam jest w porządku".

**Warianty liczone osobno.** Stek w pięciu stopniach wysmażenia to jedno danie, nie pięć. Rozbity na pięć wierszy wygląda na pięć nieistotnych pozycji, zamiast na jedną gwiazdę.

## Co z tego wynika

Menu engineering nie mówi, co wyrzucić. Mówi, gdzie szukać — a to jest inna, znacznie użyteczniejsza informacja. Trzy dania z ćwiartki koni pociągowych, w których uda się zejść po 2 zł na porcji, dają zwykle więcej niż wycięcie pięciu psów.

Analiza ma sens tylko wtedy, gdy da się ją powtórzyć co miesiąc. Robiona raz w roku w arkuszu opisuje kartę, której już nie ma.

[Spendly](/) liczy koszt porcji na bieżąco z faktur KSeF i zestawia go ze sprzedażą z POS — więc marża każdego dania aktualizuje się sama, razem z cenami dostawców.
