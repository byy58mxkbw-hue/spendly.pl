import { describe, it, expect } from "vitest";
import { compareWzWithInvoice } from "./wz-compare";

describe("compareWzWithInvoice — WZ vs faktura", () => {
  const invoice = [
    { productName: "CYTRYNA RPA", quantity: 10, unit: "kg" },
    { productName: "LASKOPOL BOCZEK WĘDZONY PARZONY", quantity: 5.5, unit: "kg" },
    { productName: "BIMI BROKUŁ MŁODY ŁODYGI 200G", quantity: 6, unit: "szt" },
    { productName: "ZIEMNIAKI NOWE MŁODE", quantity: 30, unit: "kg" },
  ];

  it("zgodne ilości, różnica, brak na WZ i pozycja spoza faktury", () => {
    const wz = [
      { productName: "Cytryna RPA", quantity: 10, unit: "kg" },
      { productName: "Boczek wędzony parzony Laskopol", quantity: 5.0, unit: "kg" },
      { productName: "Bimi brokuł młody łodygi 200g", quantity: 6, unit: "szt." },
      { productName: "Natka pietruszki pęczek", quantity: 2, unit: "szt" },
    ];
    const r = compareWzWithInvoice(invoice, wz);
    const by = (n: string) => r.rows.find((x) => x.invoiceName === n)!;
    expect(by("CYTRYNA RPA").status).toBe("ok");
    expect(by("LASKOPOL BOCZEK WĘDZONY PARZONY").status).toBe("difference");
    expect(by("LASKOPOL BOCZEK WĘDZONY PARZONY").difference).toBe(-0.5);
    expect(by("BIMI BROKUŁ MŁODY ŁODYGI 200G").status).toBe("ok");
    expect(by("ZIEMNIAKI NOWE MŁODE").status).toBe("missing_on_wz");
    expect(r.notInvoiced.map((x) => x.productName)).toEqual(["Natka pietruszki pęczek"]);
    expect(r.summary).toEqual({ ok: 2, differences: 1, missingOnWz: 1, notInvoiced: 1 });
  });

  it("kilka WZ do jednej pozycji faktury się sumuje; inna jednostka jest zgłaszana", () => {
    const r = compareWzWithInvoice(
      [{ productName: "Ziemniaki nowe młode", quantity: 30, unit: "kg" }, { productName: "Cytryna RPA", quantity: 2, unit: "kg" }],
      [
        { productName: "Ziemniaki nowe młode", quantity: 15, unit: "kg" },
        { productName: "Ziemniaki nowe młode", quantity: 15, unit: "kg" },
        { productName: "Cytryna RPA", quantity: 12, unit: "szt" },
      ],
    );
    expect(r.rows[0]!.status).toBe("ok");
    expect(r.rows[0]!.wzQuantity).toBe(30);
    expect(r.rows[1]!.status).toBe("unit_mismatch");
  });
});
