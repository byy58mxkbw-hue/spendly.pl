import { describe, it, expect } from "vitest";
import { productNameKey } from "./product-match";

// Regresja realnego incydentu: alerty cenowe trzymają NAZWĘ produktu bez klucza
// obcego, a `alert-checker` porównywał ją znak w znak (`eq(products.name, ...)`).
// Alert z inną wielkością liter albo spacją na końcu nie pasował do niczego,
// wyglądał na aktywny i milczał w nieskończoność.
describe("productNameKey", () => {
  it("ignoruje wielkość liter", () => {
    expect(productNameKey("Masło Extra 82%")).toBe(productNameKey("masło extra 82%"));
  });

  it("ignoruje białe znaki na brzegach", () => {
    expect(productNameKey("  Masło extra 82%  ")).toBe(productNameKey("Masło extra 82%"));
  });

  it("skleja wielokrotne spacje w środku", () => {
    expect(productNameKey("Bułka  hamburger   maślana")).toBe(productNameKey("Bułka hamburger maślana"));
  });

  it("traktuje tabulator i nową linię jak spację", () => {
    expect(productNameKey("Boczek\tparzony\nplastry")).toBe("boczek parzony plastry");
  });

  it("NIE skleja różnych produktów", () => {
    expect(productNameKey("Masło extra 82%")).not.toBe(productNameKey("Masło klarowane 82%"));
  });

  it("zachowuje znaki diakrytyczne — 'maslo' to nie 'masło'", () => {
    expect(productNameKey("maslo")).not.toBe(productNameKey("masło"));
  });
});
