import { describe, it, expect } from "vitest";
import { readInvoiceXml, readInvoiceFile, MAX_XML_BYTES } from "./ksef-viewer";

const FA3 = `<?xml version="1.0" encoding="UTF-8"?>
<Faktura xmlns="http://crd.gov.pl/wzor/2023/06/29/12648/">
  <Naglowek><KodFormularza kodSystemowy="FA (3)" wersjaSchemy="1-0E">FA</KodFormularza></Naglowek>
  <Podmiot1><DaneIdentyfikacyjne><NIP>5556667778</NIP><Nazwa>Zielony Rynek Sp. z o.o.</Nazwa></DaneIdentyfikacyjne></Podmiot1>
  <Podmiot2><DaneIdentyfikacyjne><NIP>1112223334</NIP><Nazwa>Bistro Test</Nazwa></DaneIdentyfikacyjne></Podmiot2>
  <Fa>
    <P_1>2026-07-14</P_1>
    <P_2>FV/2026/07/118</P_2>
    <P_13_1>100.00</P_13_1>
    <P_15>108.00</P_15>
    <RodzajFaktury>VAT</RodzajFaktury>
    <FaWiersz><P_7>Cytryna</P_7><P_8A>kg</P_8A><P_8B>5</P_8B><P_9A>9.40</P_9A><P_11>47.00</P_11><P_12>8</P_12></FaWiersz>
    <FaWiersz><P_7>Limonka</P_7><P_8A>kg</P_8A><P_8B>3</P_8B><P_9A>14.90</P_9A><P_11>44.70</P_11><P_12>8</P_12></FaWiersz>
  </Fa>
</Faktura>`;

describe("readInvoiceXml (podgląd w przeglądarce)", () => {
  it("czyta nagłówek, strony i pozycje FA(3)", () => {
    const r = readInvoiceXml(FA3, "fv.xml");
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.schema).toBe("FA3");
    expect(r.invoice.header.invoiceNumber).toBe("FV/2026/07/118");
    expect(r.invoice.header.sellerName).toBe("Zielony Rynek Sp. z o.o.");
    expect(r.invoice.header.buyerName).toBe("Bistro Test");
    expect(r.invoice.items).toHaveLength(2);
  });

  it("odrzuca DOCTYPE/ENTITY już w przeglądarce", () => {
    const evil = FA3.replace('<?xml version="1.0" encoding="UTF-8"?>', '<?xml version="1.0"?><!DOCTYPE x [<!ENTITY e SYSTEM "file:///etc/passwd">]>');
    const r = readInvoiceXml(evil, "fv.xml");
    expect(r).toMatchObject({ ok: false, reason: "dtd" });
  });

  it("plik bez <Faktura> (np. UPO) → not_invoice", () => {
    expect(readInvoiceXml("<Potwierdzenie><NumerKSeF>1</NumerKSeF></Potwierdzenie>", "upo.xml")).toMatchObject({ ok: false, reason: "not_invoice" });
  });
});

describe("readInvoiceFile", () => {
  it("odrzuca plik, który nie jest XML", async () => {
    const r = await readInvoiceFile(new File(["x"], "faktura.pdf", { type: "application/pdf" }));
    expect(r).toMatchObject({ ok: false, reason: "not_xml" });
  });

  it("odrzuca plik ponad 5 MB bez czytania treści", async () => {
    const big = new File([new Uint8Array(MAX_XML_BYTES + 1)], "duza.xml", { type: "text/xml" });
    expect(await readInvoiceFile(big)).toMatchObject({ ok: false, reason: "too_large" });
  });
});
