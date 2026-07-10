import { describe, it, expect } from "vitest";
import { matchBrand } from "./brand-map";
import { BUILTIN_CATEGORY_DEFS } from "./categorize";

describe("matchBrand: rozpoznanie marek", () => {
  const cases: Array<[string, string, string]> = [
    ["cheddar hochland 1kg", "sery", "ser cheddar"],
    ["coca-cola 1l", "napoje", "cola"],
    ["barilla spaghetti n5", "pieczywo", "makaron"],
    ["ludwik płyn do naczyń", "srodki_czystosci", "płyn do naczyń"],
    ["tabasco sos ostry", "przyprawy", "sos ostry"],
    ["woda cisowianka 1,5l", "napoje", "woda"],
    ["serek almette naturalny", "sery", "serek kremowy"],
  ];
  for (const [name, category, subcategory] of cases) {
    it(`"${name}" → ${category}/${subcategory}`, () => {
      expect(matchBrand(name.toLowerCase())).toEqual({ category, subcategory });
    });
  }
});

describe("matchBrand: brak false-positive na zwykłych nazwach", () => {
  for (const name of ["masło extra 82%", "chleb razowy", "kawa mielona", "łosoś wędzony", "pomidor malinowy"]) {
    it(`"${name}" → null`, () => {
      expect(matchBrand(name.toLowerCase())).toBeNull();
    });
  }
});

describe("matchBrand: kategorie marek istnieją w BUILTIN_CATEGORY_DEFS", () => {
  it("każda zmapowana marka wskazuje realną kategorię", () => {
    // Sanity: żadna marka nie mapuje na nieistniejące ID kategorii.
    const samples = ["cheddar", "coca-cola", "barilla", "domestos", "nutella", "hortex", "łowicz", "tyskie"];
    for (const s of samples) {
      const info = matchBrand(s);
      expect(info).not.toBeNull();
      expect(BUILTIN_CATEGORY_DEFS[info!.category]).toBeDefined();
    }
  });
});
