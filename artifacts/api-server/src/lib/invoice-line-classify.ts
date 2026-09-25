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
