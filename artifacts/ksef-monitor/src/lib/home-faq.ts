// FAQ strony głównej — JEDNO źródło dla:
//  - sekcji FAQ w `pages/home.tsx` (React),
//  - statycznego prerenderu i schema.org FAQPage w `index.html` (reguła 26:
//    prerender pierwszego ekranu musi zgadzać się z home.tsx).
// Google wymaga, żeby pytania ze schema FAQPage były widoczne na stronie —
// wcześniej index.html miał 6 innych pytań niż React (5). Zgodność pilnuje
// test `home-faq.test.ts`. Zmieniasz pytanie → zmień je też w index.html.
export const HOME_FAQ: ReadonlyArray<{ q: string; a: string }> = [
  {
    q: "Czym jest KSeF?",
    a: "KSeF, czyli Krajowy System e-Faktur, to rządowa platforma do wystawiania i odbierania faktur w jednym formacie XML. Wszystkie faktury od dostawców trafiają do jednego systemu, przypisane do NIP-u Twojej firmy.",
  },
  {
    q: "Od kiedy KSeF jest obowiązkowy dla restauracji?",
    a: "Obowiązek wchodzi etapami w 2026 roku. Odbieranie faktur przez KSeF dotyczy wszystkich od 1 lutego 2026, a większość restauracji będących czynnymi podatnikami VAT wystawia faktury w KSeF od 1 kwietnia 2026.",
  },
  {
    q: "Czy Spendly integruje się z KSeF?",
    a: "Tak. Spendly łączy się bezpośrednio z API Krajowego Systemu e-Faktur i automatycznie pobiera faktury zakupowe dla Twojego NIP-u. Wystarczy jednorazowo podać NIP i token, resztą zajmuje się system.",
  },
  {
    q: "Co to jest food cost i jak liczy go Spendly?",
    a: "Food cost to udział kosztu surowców w cenie dania albo w przychodzie lokalu. Spendly liczy go z cen z Twoich faktur zakupowych i receptur dań, więc koszt porcji aktualizuje się przy każdej nowej dostawie.",
  },
  {
    q: "Jak Spendly wyłapuje podwyżki cen u dostawców?",
    a: "Porównuje cenę każdego produktu z poprzednimi fakturami w tej samej jednostce miary. Gdy cena przekroczy ustawiony próg, dostajesz alert i widzisz, które dania podrożały.",
  },
  {
    q: "Jak działa OCR faktur?",
    a: "Robisz zdjęcie faktury albo wgrywasz PDF, także kilkustronicowy. System odczytuje dostawcę, produkty, ilości i ceny, a pozycje dopasowuje do produktów, które już kupujesz.",
  },
  {
    q: "Czy muszę zmieniać dostawców albo system POS?",
    a: "Nie. Spendly działa obok Twoich obecnych dostawców i systemów. Podpinasz KSeF, a jeśli używasz GoPOS, możesz połączyć też sprzedaż, żeby liczyć realny food cost.",
  },
  {
    q: "Ile kosztuje Spendly?",
    a: "Plan Start jest darmowy dla jednego lokalu. Plan Pro kosztuje 150 zł miesięcznie i obejmuje do 3 lokali, porównanie dostawców, food cost i asystenta AI. Dla sieci przygotowujemy wycenę indywidualną.",
  },
  {
    q: "Czy jest okres próbny?",
    a: "Tak. Nowi użytkownicy dostają 30 dni darmowego dostępu do planu Pro, bez podawania karty. Po tym czasie zostają na bezpłatnym planie Start albo przechodzą na Pro.",
  },
  {
    q: "Czy mogę zrezygnować w dowolnym momencie?",
    a: "Tak. Nie ma długoterminowych umów. Rezygnujesz z subskrypcji, kiedy chcesz, bez opłat za rezygnację.",
  },
  {
    q: "Jak chronione są moje dane?",
    a: "Faktury i tokeny KSeF są szyfrowane AES-256-GCM w bazie danych. Każdy użytkownik ma dostęp wyłącznie do swoich danych, a komunikacja odbywa się tylko przez szyfrowane połączenie HTTPS.",
  },
  {
    q: "Czy Spendly sprawdzi się przy kilku lokalach?",
    a: "Tak. Plan Pro obsługuje do 3 lokali, a plan Sieć dowolną liczbę, z centrami kosztów, rolami i raportami dla całej grupy.",
  },
];
