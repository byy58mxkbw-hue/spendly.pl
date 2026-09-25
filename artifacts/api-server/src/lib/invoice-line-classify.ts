import { sql, type SQL } from "drizzle-orm";

// Rozpoznawanie pozycji faktury, które NIE są realnym produktem/towarem —
// tylko rozliczeniem wcześniej wpłaconej zaliczki. Dostawcy wystawiający
// faktury ROZLICZENIOWE (RodzajFaktury=ROZ, np. Lasy Państwowe/Nadleśnictwa
// za drewno) dokładają do rzeczywistych pozycji towarowych jeszcze jeden
// "wiersz" typu "Zaliczka 23% VAT" z ujemną wartością, żeby zbilansować
// fakturę do kwoty, która faktycznie pozostaje do zapłaty (często 0 zł, bo
// zaliczka pokryła całość). Bez tego filtra taki wiersz trafiał do bazy jako
// osobny "produkt" (findOrCreateProductByName) i zaśmiecał listę produktów,
// historię cen, raporty i narzędzia AI CFO absurdalnymi cenami/ilościami
// (realny raport użytkownika 2026-09-26: "Zaliczka 23% VAT" jako produkt
// z ceną -12 225,78 zł i ilością -1 szt).
//
// Dopasowanie po granicy słowa (reguła 27) — nigdy includes() na surowym
// stringu, żeby nie złapać np. nazwy towaru zawierającej "zaliczka" w środku.
const ADVANCE_SETTLEMENT_LINE_RE = /\bzaliczk\w*/i;

export function isAdvanceSettlementLine(name: string): boolean {
  return ADVANCE_SETTLEMENT_LINE_RE.test(name);
}

// Filtr do zapytań SUMUJĄCYCH WYDATKI (raporty, kategorie, AI CFO spend summary) —
// NIE do zapytań o CENĘ/ILOŚĆ JEDNOSTKOWĄ (historia cen, anomalie, food cost).
//
// Realny audyt produkcyjny 2026-09-26: faktura rozliczeniowa (ROZ) rozdziela
// WCZEŚNIEJ zapłaconą zaliczkę na konkretne pozycje towarowe — jej dodatnie
// wiersze (np. "drewno sosnowe... 78 558 zł") NIE są nowym wydatkiem, tylko
// alokacją pieniędzy policzonych już wcześniej przy fakturze zaliczkowej. Licząc
// je jako świeży wydatek w raporcie kategorii/miesiąca, zawyżasz sumę — sprawdzone
// na koncie usera: sierpień pokazywał ~78,5 tys. zł "za drewno" z samych faktur
// rozliczeniowych, podczas gdy realnie zapłacona zaliczka w tym miesiącu to 77,2
// tys. zł (i to WŁAŚNIE ta kwota powinna liczyć się jako wydatek).
//
// Korekty (KOR) wykluczamy z tego samego powodu co reszta kodu (nie są nowym
// wydatkiem, tylko zmianą wcześniejszego) — NULL (jeszcze nieodtworzone przez
// backfill) przechodzi filtr bez zmian (IS DISTINCT FROM traktuje NULL jako "nie
// jest tym typem"), więc jest bezpieczny nawet przed pełnym backfillem.
//
// Zapytania o CENĘ JEDNOSTKOWĄ (get_product_price_history, get_price_increases,
// food-cost) CELOWO zostają bez tego filtra — cena za m3 drewna z faktury
// rozliczeniowej jest realną, wartościową ceną rynkową, nawet jeśli sama faktura
// nie generuje nowego wydatku.
export function excludeNonSpendInvoiceTypes(invoicesAlias: string): SQL {
  return sql.raw(
    `AND ${invoicesAlias}.invoice_type IS DISTINCT FROM 'KOR' AND ${invoicesAlias}.invoice_type IS DISTINCT FROM 'ROZ'`,
  );
}
