import { describe, it, expect } from "vitest";
import { parseKSeFXml } from "./invoice-xml-parse";

// FA(3) z przestrzenią nazw + jedna pozycja.
const FA3 = `<?xml version="1.0" encoding="UTF-8"?>
<Faktura xmlns="http://crd.gov.pl/wzor/2023/06/29/12648/">
  <Fa>
    <P_1>2026-07-10</P_1>
    <P_2>FV/2026/07/123</P_2>
    <P_13_1>100.00</P_13_1>
    <P_15>123.00</P_15>
    <RodzajFaktury>VAT</RodzajFaktury>
    <FaWiersz>
      <P_7>Mleko 3.2%</P_7>
      <P_8A>l</P_8A>
      <P_8B>10</P_8B>
      <P_9A>10.00</P_9A>
      <P_11>100.00</P_11>
      <P_12>23</P_12>
    </FaWiersz>
  </Fa>
</Faktura>`;

describe("parseKSeFXml", () => {
  it("parsuje numer, datę, brutto i pozycję z FA(3) z namespace", () => {
    const r = parseKSeFXml(FA3);
    expect(r.invoiceNumber).toBe("FV/2026/07/123");
    expect(r.invoiceDate).toBe("2026-07-10");
    expect(r.totalGross).toBeCloseTo(123, 2);
    expect(r.invoiceType).toBe("VAT");
    expect(r.items).toHaveLength(1);
    expect(r.items[0]).toMatchObject({
      productName: "Mleko 3.2%",
      quantity: 10,
      unit: "l",
      unitPrice: 10,
      totalPrice: 100,
      vatRate: 23,
    });
  });

  it("konwertuje datę dd.mm.yyyy na ISO", () => {
    const xml = FA3.replace("<P_1>2026-07-10</P_1>", "<P_1>05.03.2026</P_1>");
    expect(parseKSeFXml(xml).invoiceDate).toBe("2026-03-05");
  });

  it("odrzuca niepoprawny format daty (zwraca null)", () => {
    const xml = FA3.replace("<P_1>2026-07-10</P_1>", "<P_1>lipiec 2026</P_1>");
    expect(parseKSeFXml(xml).invoiceDate).toBeNull();
  });

  it("liczby z przecinkiem i spacjami (format PL) parsuje poprawnie", () => {
    const xml = FA3
      .replace("<P_8B>10</P_8B>", "<P_8B>2,5</P_8B>")
      .replace("<P_9A>10.00</P_9A>", "<P_9A>1 234,50</P_9A>")
      .replace("<P_11>100.00</P_11>", "<P_11>3 086,25</P_11>");
    const it0 = parseKSeFXml(xml).items[0];
    expect(it0.quantity).toBeCloseTo(2.5, 4);
    expect(it0.unitPrice).toBeCloseTo(1234.5, 2);
    expect(it0.totalPrice).toBeCloseTo(3086.25, 2);
  });

  it("faktura korygująca (KOR) z ujemnym nagłówkiem odwraca znaki pozycji", () => {
    const kor = FA3
      .replace("<RodzajFaktury>VAT</RodzajFaktury>", "<RodzajFaktury>KOR</RodzajFaktury><NrFaKorygowanej>FV/2026/07/100</NrFaKorygowanej>")
      .replace("<P_13_1>100.00</P_13_1>", "<P_13_1>-100.00</P_13_1>")
      .replace("<P_15>123.00</P_15>", "<P_15>-123.00</P_15>");
    const r = parseKSeFXml(kor);
    expect(r.invoiceType).toBe("KOR");
    expect(r.correctedInvoiceNumber).toBe("FV/2026/07/100");
    expect(r.items[0].quantity).toBe(-10);
    expect(r.items[0].totalPrice).toBe(-100);
  });

  it("KOR z już ujemnymi pozycjami NIE odwraca znaków podwójnie", () => {
    const kor = FA3
      .replace("<RodzajFaktury>VAT</RodzajFaktury>", "<RodzajFaktury>KOR</RodzajFaktury>")
      .replace("<P_13_1>100.00</P_13_1>", "<P_13_1>-100.00</P_13_1>")
      .replace("<P_8B>10</P_8B>", "<P_8B>-10</P_8B>")
      .replace("<P_11>100.00</P_11>", "<P_11>-100.00</P_11>");
    const r = parseKSeFXml(kor);
    expect(r.items[0].quantity).toBe(-10);
    expect(r.items[0].totalPrice).toBe(-100);
  });

  it("brak pozycji → pusta lista, pola nagłówka null", () => {
    const r = parseKSeFXml("<Faktura></Faktura>");
    expect(r.items).toEqual([]);
    expect(r.invoiceNumber).toBeNull();
    expect(r.invoiceDate).toBeNull();
    expect(r.totalGross).toBeNull();
  });

  it("domyślna jednostka 'szt' gdy brak P_8A", () => {
    const xml = FA3.replace("<P_8A>l</P_8A>", "");
    expect(parseKSeFXml(xml).items[0].unit).toBe("szt");
  });
});
