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

// Audyt realnych danych (2026-09): "iglotex", "łowicz", "knorr" to marki wieloliniowe
// (sprzedają pełny asortyment, nie tylko swoją "flagową" kategorię) — sztywne
// mapowanie marka→kategoria psuło ich pozostałe produkty (np. orzechy/ryż pod
// marką mrożonek, masło/ser pod marką konserw). Usunięte z BRAND_MAP celowo —
// te produkty i tak trafiają poprawnie przez keywordy.
describe("matchBrand: usunięte marki wieloliniowe nie wymuszają już jednej kategorii", () => {
  it('"iglotex" nie jest już rozpoznawane jako marka (keywordy decydują)', () => {
    expect(matchBrand("orzechy laskowe 1kg iglotex professional")).toBeNull();
  });
  it('"łowicz" nie jest już rozpoznawane jako marka', () => {
    expect(matchBrand("masło extra 200g łowicz")).toBeNull();
  });
  it('"knorr" nie jest już rozpoznawane jako marka', () => {
    expect(matchBrand("ryż długoziarnisty 5kg knorr")).toBeNull();
  });
  it('"piątnica" nie jest już rozpoznawane jako marka (robi też sery, nie tylko nabiał)', () => {
    expect(matchBrand("serek do sushi śmietankowy piątnica")).toBeNull();
  });
  it('"mlekovita" nie jest już rozpoznawane jako marka (robi też sery, nie tylko nabiał)', () => {
    expect(matchBrand("ser faruki wędzone mlekovita")).toBeNull();
  });
  it('"pudliszki" nie jest już rozpoznawane jako marka (robi też pomidory w puszce, nie tylko ketchup)', () => {
    expect(matchBrand("pomidory pelati pudliszki")).toBeNull();
  });
});

describe("matchBrand: kategorie marek istnieją w BUILTIN_CATEGORY_DEFS", () => {
  it("każda zmapowana marka wskazuje realną kategorię", () => {
    // Sanity: żadna marka nie mapuje na nieistniejące ID kategorii.
    const samples = ["cheddar", "coca-cola", "barilla", "domestos", "nutella", "hortex", "bonduelle", "tyskie"];
    for (const s of samples) {
      const info = matchBrand(s);
      expect(info).not.toBeNull();
      expect(BUILTIN_CATEGORY_DEFS[info!.category]).toBeDefined();
    }
  });
});
