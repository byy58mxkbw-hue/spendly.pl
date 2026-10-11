import { describe, it, expect } from "vitest";
import { genericProduct, packSignature, packKeyFor } from "./generic-product";

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

describe("groupOf — grupy do prezentacji", () => {
  it("ze słownika, nie z kategorii użytkowników", () => {
    expect(genericProduct("Karkówka bez kości")?.group).toBe("Mięso i ryby");
    expect(genericProduct("Mięta cięta")?.group).toBe("Zioła");
    expect(genericProduct("Cytryny")?.group).toBe("Owoce");
    expect(genericProduct("Pieczarki")?.group).toBe("Warzywa");
    expect(genericProduct("Ryż basmati 5kg")?.group).toBe("Spiżarnia");
  });
});

describe("przetworzone produkty z prawdziwych faktur (2026-10-11)", () => {
  it.each([
    ["[PRYMAT] CZOSNEK GRANULOWANY 1,05KG PET", "Czosnek"],
    ["[JARBAB] CZOSNEK GRANULOWANY 1KG", "Czosnek"],
    ["OLIWA Z OLIWEK CZOSNEK I CHILLI 250ML [6SZT] {MONINI}", "Czosnek"],
    ["[SCHOLLER] KUWETA SORBET MALINOWY 5L", "Malina"],
    ["CUKIER MK CAFE PALUSZKI 1000 SZT x 5g", "Cukier"],
  ])("„%s” nie jest produktem bazowym %s", (name, wrong) => {
    expect(genericProduct(name)?.label).not.toBe(wrong);
  });

  it("świeże nadal działają", () => {
    expect(genericProduct("Czosnek polski")?.label).toBe("Czosnek");
    expect(genericProduct("Sałata lodowa")?.label).toBe("Sałata lodowa");
    expect(genericProduct("Winogrono białe")?.label).toBe("Winogrono");
    expect(genericProduct("Cukier biały 1kg")?.label).toBe("Cukier");
  });
});

describe("packSignature / packKeyFor — gramatura opakowania", () => {
  it("wyciąga ilości z nazwy", () => {
    expect(packSignature("CZOSNEK GRANULOWANY 1,05KG PET")).toBe("1.05kg");
    expect(packSignature("SER CHEDDAR PLASTRY 1KG [6SZT]")).toBe("1kg+6szt");
    expect(packSignature("CUKIER MK CAFE PALUSZKI 1000 SZT x 5g")).toBe("1000szt+5g");
    expect(packSignature("Czosnek polski")).toBe("");
  });
  it("liczy się tylko przy jednostkach na sztuki", () => {
    expect(packKeyFor("Cytryna 5kg", "kg")).toBe("");
    expect(packKeyFor("Cytryna 5kg", "szt")).toBe("5kg");
    expect(packKeyFor("Czosnek", "szt")).toBe("");
  });
});
