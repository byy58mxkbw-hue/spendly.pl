import { describe, it, expect } from "vitest";
import { categorizeProduct } from "./categorize";

// Z5 — dopasowanie słów kluczowych po granicy słowa (z polskimi znakami).
// Siatka regresji: pewne trafienia + pułapki, w których stare `includes`
// dawało false-positive na fragmencie słowa.
describe("categorizeProduct: pewne trafienia", () => {
  const cases: Array<[string, string]> = [
    ["mleko 2%", "nabiał"],
    ["masło extra 82%", "nabiał"],
    ["jogurt naturalny", "nabiał"],
    // Sery wydzielone z Nabiału (Z8):
    ["serek wiejski", "sery"],
    ["ser cheddar", "sery"],
    ["twaróg", "sery"],
    ["mozzarella", "sery"],
    ["filet z łososia", "ryby"],
    ["wołowina", "miesa"],
    ["kurczak filet", "miesa"],
    ["pomidor malinowy", "warzywa"],
    ["woda mineralna", "napoje"],
    ["piwo ale", "alkohole"],
    ["konserwa rybna", "konserwy"],
  ];
  for (const [name, expected] of cases) {
    it(`"${name}" → ${expected}`, () => {
      expect(categorizeProduct(name)).toBe(expected);
    });
  }
});

describe("categorizeProduct: granica słowa nie łapie fragmentów", () => {
  // „konserwa" zawiera „ser", ale nie jest nabiałem (dopasowanie po granicy słowa).
  it('"konserwa rybna" nie trafia do nabiał', () => {
    expect(categorizeProduct("konserwa rybna")).not.toBe("nabiał");
  });
  // Słowa niespożywcze / nieznane → inne (brak false-positive na fragmencie).
  for (const name of ["import towarów", "konsumpcyjny", "xyz nieznane produkt"]) {
    it(`"${name}" → inne`, () => {
      expect(categorizeProduct(name)).toBe("inne");
    });
  }
});
