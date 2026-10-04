import { describe, it, expect } from "vitest";
import { isValidNip, sameCompanyName, findSupplierMatch } from "./supplier-match";

describe("isValidNip", () => {
  it("przyjmuje poprawny NIP i odrzuca błędną sumę kontrolną", () => {
    expect(isValidNip("5260250995")).toBe(true); // przykładowy poprawny NIP
    expect(isValidNip("526-025-09-95")).toBe(true);
    expect(isValidNip("1234567890")).toBe(false);
    expect(isValidNip("9879879877")).toBe(false);
    expect(isValidNip("0000000000")).toBe(false);
    expect(isValidNip("")).toBe(false);
    expect(isValidNip(null)).toBe(false);
  });
});

describe("sameCompanyName", () => {
  it("ignoruje formy prawne, oddziały i kraj", () => {
    expect(sameCompanyName("Chefs Culinar Sp. z o.o.", "Chefs Culinar oddział Warszawa")).toBe(true);
    expect(sameCompanyName("CHEFS CULINAR POLSKA Sp. z o.o.", "Chefs Culinar Sp. z o.o.")).toBe(true);
    expect(sameCompanyName("Makro Cash and Carry Polska S.A.", "MAKRO CASH AND CARRY")).toBe(true);
  });

  it("nie skleja różnych firm ani zbyt ogólnych nazw", () => {
    expect(sameCompanyName("Chefs Culinar Sp. z o.o.", "Chefs Kitchen Sp. z o.o.")).toBe(false);
    expect(sameCompanyName("Dostawca", "Dostawca")).toBe(true); // ta sama nazwa — ale długa >= 4
    expect(sameCompanyName("ABC", "ABC Sp. z o.o.")).toBe(false); // jedno krótkie słowo to za mało
  });
});

describe("findSupplierMatch", () => {
  const suppliers = [
    { id: 1, name: "Chefs Culinar Sp. z o.o.", taxId: "5260250995" },
    { id: 2, name: "Hurtownia Owoców Jan", taxId: "7010000001" },
  ];

  it("dopasowuje po NIP", () => {
    expect(findSupplierMatch({ nip: "526-025-09-95", name: "Inna nazwa" }, suppliers)).toEqual({ id: 1, reason: "nip" });
  });

  it("dopasowuje po nazwie, gdy NIP jest inny lub brak", () => {
    expect(findSupplierMatch({ nip: null, name: "CHEFS CULINAR POLSKA" }, suppliers)).toEqual({ id: 1, reason: "name" });
  });

  it("łapie błąd OCR jednej cyfry w NIP (gdy odczytany NIP jest niepoprawny)", () => {
    // 5270250995 — jedna cyfra inna niż 5260250995 i nie przechodzi sumy kontrolnej.
    expect(isValidNip("5270250995")).toBe(false);
    expect(findSupplierMatch({ nip: "5270250995", name: "Nieczytelna nazwa" }, suppliers)).toEqual({ id: 1, reason: "nip_typo" });
  });

  it("brak dopasowania dla nowej firmy", () => {
    expect(findSupplierMatch({ nip: "1132853869", name: "Zupełnie Nowa Firma" }, suppliers)).toBeNull();
  });
});
