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

// Wariant dla zapytań, które w TYM SAMYM wierszu liczą i pieniądze, i ILOŚĆ
// (np. "SUM(quantity) AS total_quantity, SUM(total_price) AS total_spend" razem).
// excludeNonSpendInvoiceTypes() w WHERE wycina CAŁY wiersz — czyli razem z prawdziwą,
// fizycznie dostarczoną ilością drewna z faktury rozliczeniowej, co zaniża ilość
// (realny raport użytkownika 2026-09-26: "a ilość?" — dobra uwaga, ROZ NIE dubluje
// ilości tak jak dubluje pieniądze, bo faktura zaliczkowa nie ma w ogóle rozbicia
// na pozycje/ilości — jedyne źródło realnej ilości to właśnie ROZ).
//
// Użycie: owiń WYŁĄCZNIE wyrażenie pieniężne w SUM(...) tym helperem, zostaw
// SUM(quantity) bez zmian i usuń excludeNonSpendInvoiceTypes() z WHERE tej samej
// kwerendy — inaczej filtr zadziała podwójnie (i tak samo obetnie ilość).
export function spendOnly(invoicesAlias: string, moneyExpr: SQL): SQL {
  return sql`(CASE WHEN ${sql.raw(invoicesAlias)}.invoice_type IS DISTINCT FROM 'KOR' AND ${sql.raw(invoicesAlias)}.invoice_type IS DISTINCT FROM 'ROZ' THEN ${moneyExpr} ELSE 0 END)`;
}

// Ten sam wzorzec co ADVANCE_SETTLEMENT_LINE_RE (JS), ale jako Postgresowy regex —
// dla kwerend, które sumują ILOŚĆ BEZ JOIN-a do products (więc nie mogą polegać na
// product_id IS NULL). Granica słowa po polskim alfabecie (reguła 27).
const ADVANCE_SETTLEMENT_LINE_SQL_PATTERN = "(^|[^a-ząćęłńóśźż])zaliczk";

// Dobre pytanie użytkownika (2026-09-26): "nie dublują się ilości towaru?" — NIE
// (faktura zaliczkowa w ogóle nie ma rozbicia na pozycje, więc nie ma czego
// dublować), ALE w kwerendach BEZ JOIN-a do products (np. suma ilości per
// dostawca) sama linia "Zaliczka" ma swoją WŁASNĄ, fikcyjną "ilość" (np. -1 szt) —
// ta miesza się z realnymi m3 drewna w tej samej sumie, jeśli jej nie wykluczysz.
// Użycie: owiń SUM(quantity) tym helperem w kwerendach BEZ INNER JOIN products
// (te z INNER JOIN już wykluczają linię Zaliczka automatycznie, bo ma
// product_id = NULL — patrz lib/invoice-line-classify.ts / ksef-ingest.ts).
export function realQuantityOnly(itemsAlias: string, qtyExpr: SQL): SQL {
  return sql`(CASE WHEN lower(${sql.raw(itemsAlias)}.product_name) ~ ${ADVANCE_SETTLEMENT_LINE_SQL_PATTERN} THEN 0 ELSE ${qtyExpr} END)`;
}
