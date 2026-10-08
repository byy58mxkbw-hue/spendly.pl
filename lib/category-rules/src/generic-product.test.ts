import { describe, it, expect } from "vitest";
import { genericProduct } from "./generic-product";

const label = (n: string) => genericProduct(n)?.label ?? null;

describe("genericProduct — produkt bazowy z nazwy z faktury", () => {
  it.each([
    ["CYTRYNY ARGENTYNA KL.I", "Cytryna"],
    ["Cytryna luz 1kg", "Cytryna"],
    ["cytryny świeże hiszpania", "Cytryna"],
    ["limonka sokowa owoc świeży", "Limonka"],
    ["LIMETKI", "Limonka"],
    ["Pomidor malinowy kl. I", "Pomidor malinowy"],
    ["POMIDORY KOKTAJLOWE 250G", "Pomidor koktajlowy"],
    ["pomidor gałązka", "Pomidor"],
    ["Ziemniaki młode 15kg", "Ziemniaki"],
    ["PIECZARKI KRAJOWE", "Pieczarki"],
    ["mięta cięta zioła świeże", "Mięta"],
    ["MC MIĘTA CIĘTA _ HISZPANI", "Mięta"],
    ["Filet z piersi kurczaka świeży", "Filet z kurczaka"],
    ["PIERS Z KURCZAKA B/K", "Filet z kurczaka"],
    ["Masło extra 82% 200g", "Masło"],
    ["mleko zambrow. uht 3,2%", "Mleko"],
    ["Śmietana 30% UHT 1l", "Śmietana 30%"],
    ["ŚMIETANKA 36% 1L", "Śmietana 36%"],
    ["Jaja L 30 szt", "Jaja"],
    ["Ogórek kiszony beczka", "Ogórek kiszony"],
    ["ogórek zielony szklarniowy", "Ogórek"],
    ["Por krajowy", "Por"],
    ["Mąka pszenna typ 450", "Mąka pszenna"],
    ["SÓL KAMIENNA 1KG", "Sól"],
    ["Łosoś norweski filet", "Łosoś"],
  ])("„%s” → %s", (name, expected) => {
    expect(label(name)).toBe(expected);
  });

  it.each([
    "rioba sok z cytryny",
    "Puree marakuja",
    "koncentrat pomidorowy 30%",
    "Pomidory suszone w oleju",
    "Papryka słodka mielona",
    "Makaron jajeczny",
    "Maślanka naturalna",
    "porcja rosołowa",
    "Mleko kokosowe 400ml",
    "Czipsy ziemniaczane",
    "0.25 rgb x24 coca-cola",
    "Herbata miętowa",
  ])("nie łączy z produktem świeżym/bazowym: „%s”", (name) => {
    const r = label(name);
    // Albo brak dopasowania, albo osobna kategoria — ale nigdy świeża wersja.
    expect(["Cytryna", "Pomidor", "Papryka", "Jaja", "Masło", "Por", "Mleko", "Ziemniaki", "Mięta"]).not.toContain(r);
  });

  it("ten sam produkt od różnych dostawców daje ten sam klucz", () => {
    const keys = ["CYTRYNY ARGENTYNA KL.I", "Cytryna luz", "cytryny swieze"].map((n) => genericProduct(n)?.key);
    expect(new Set(keys).size).toBe(1);
    expect(keys[0]).toBe("cytryna");
  });
});
