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
  // Regresja: "ser " (z końcową spacją) trafiało do gałęzi "fraza" (bo zawiera
  // spację) i leciało na gołym includes bez lewej granicy — łapało się w środku
  // dłuższych słów. "koneser go" / "frytura" to olej, nie ser.
  it('"[KONESER GO] FRYTURA RZEPAKOWA PŁYNNA" nie trafia do sery', () => {
    expect(categorizeProduct("[KONESER GO] FRYTURA RZEPAKOWA PŁYNNA 9,5L WIADRO")).not.toBe("sery");
  });
  it('"deser czekoladowy" nie trafia do sery', () => {
    expect(categorizeProduct("deser czekoladowy")).not.toBe("sery");
  });
  it('"ser żółty plastry" nadal trafia do sery (prawdziwe trafienie nie ucierpiało)', () => {
    expect(categorizeProduct("ser żółty plastry")).toBe("sery");
  });
  // Słowa niespożywcze / nieznane → inne (brak false-positive na fragmencie).
  for (const name of ["import towarów", "konsumpcyjny", "xyz nieznane produkt"]) {
    it(`"${name}" → inne`, () => {
      expect(categorizeProduct(name)).toBe("inne");
    });
  }
});
