# Generator PDF faktur KSeF (Ministerstwo Finansów)

Zbudowana wersja oficjalnego generatora wizualizacji faktur KSeF:
https://github.com/CIRFMF/ksef-pdf-generator (licencja MIT, plik `LICENSE`).

- Wersja: 1.1.40, commit `f59fc4e` (zbudowane `npm run build`, plik `dist/ksef-fe-invoice-converter.js`).
- Zawiera w sobie zależności: pdfmake 0.3.11 (MIT), xml-js (MIT), i18next (MIT).
- Ładowany WYŁĄCZNIE leniwie (`await import(...)` w `src/lib/ksef-pdf.ts`) — nie może trafić do bundla landingu.

Aktualizacja: sklonuj repozytorium, `npm install && npm run build`, podmień `ksef-pdf-generator.js`,
zaktualizuj wersję i commit powyżej, przetestuj generowanie PDF na `vite preview` (wymuszone CSP).
