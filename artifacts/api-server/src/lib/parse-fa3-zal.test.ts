import { describe, it, expect } from "vitest";
import { parseFA3Xml } from "@workspace/ksef-client";
import { isAdvanceSettlementLine } from "./invoice-line-classify";

// Faktura zaliczkowa (ZAL) w FA(3) nie ma <FaWiersz> — pozycje zamówienia są w
// <Zamowienie>/<ZamowienieWiersz>. Wcześniej parser zwracał 0 pozycji, faktura
// utykała w „Do przeglądu” i zapłacona zaliczka nie liczyła się w wydatkach.

const zal = (fa: string) => `<?xml version="1.0" encoding="UTF-8"?>
<Faktura xmlns="http://crd.gov.pl/wzor/2025/06/25/13775/">
  <Podmiot1><DaneIdentyfikacyjne><NIP>5260000000</NIP><Nazwa>Nadleśnictwo Testowe</Nazwa></DaneIdentyfikacyjne></Podmiot1>
  <Podmiot2><DaneIdentyfikacyjne><NIP>1230000000</NIP></DaneIdentyfikacyjne></Podmiot2>
  <Fa>
    <P_1>2026-08-05</P_1>
    <P_2>ZAL/1/2026</P_2>
    ${fa}
    <RodzajFaktury>ZAL</RodzajFaktury>
    <Zamowienie>
      <WartoscZamowienia>123000.00</WartoscZamowienia>
      <ZamowienieWiersz><P_7Z>Drewno sosnowe S2</P_7Z><P_8AZ>m3</P_8AZ><P_8BZ>500</P_8BZ><P_9AZ>200</P_9AZ><P_12Z>23</P_12Z></ZamowienieWiersz>
    </Zamowienie>
  </Fa>
</Faktura>`;

describe("parseFA3Xml: faktura zaliczkowa (ZAL)", () => {
  it("buduje linię zaliczki z sum faktury per stawka VAT", () => {
    const parsed = parseFA3Xml(zal("<P_13_1>62764.23</P_13_1><P_14_1>14435.77</P_14_1><P_15>77200.00</P_15>"), "KSEF-ZAL-1");
    expect(parsed.header.invoiceType).toBe("ZAL");
    expect(parsed.items).toHaveLength(1);
    const it0 = parsed.items[0];
    expect(it0.name).toBe("Zaliczka na zamówienie: Drewno sosnowe S2");
    expect(it0.net).toBeCloseTo(62764.23, 2);
    expect(it0.gross).toBeCloseTo(77200, 2);
    expect(it0.vatRate).toBe(23);
    // Import traktuje ją jak rozliczenie zaliczki: bez produktu, nie „brakujący produkt”.
    expect(isAdvanceSettlementLine(it0.name)).toBe(true);
  });

  it("dwie stawki VAT → dwie linie, suma brutto = P_15", () => {
    const parsed = parseFA3Xml(
      zal("<P_13_1>1000</P_13_1><P_14_1>230</P_14_1><P_13_2>500</P_13_2><P_14_2>40</P_14_2><P_15>1770</P_15>"),
      "KSEF-ZAL-2",
    );
    expect(parsed.items.map((i) => i.vatRate)).toEqual([23, 8]);
    expect(parsed.items.reduce((s, i) => s + i.gross, 0)).toBeCloseTo(1770, 2);
  });

  it("bez sum per stawka — jedna linia z kwotą brutto faktury", () => {
    const parsed = parseFA3Xml(zal("<P_15>500</P_15>"), "KSEF-ZAL-3");
    expect(parsed.items).toHaveLength(1);
    expect(parsed.items[0].gross).toBe(500);
  });
});
