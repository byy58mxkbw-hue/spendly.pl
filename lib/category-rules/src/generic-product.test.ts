import { describe, it, expect } from "vitest";
import { genericProduct, packSignature, parsePack, priceBasis, isNonFood, skipReason } from "./generic-product";

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
  it("cena za opakowanie → cena za kg/l", () => {
    expect(priceBasis("Cytryna 5kg", "kg")).toMatchObject({ compareUnit: "kg", factor: 1, packKey: "" });
    expect(priceBasis("Cytryna 5kg", "szt")).toMatchObject({ compareUnit: "kg", factor: 0.2, packKey: "", packTier: "M" });
    expect(priceBasis("Czosnek", "szt")).toMatchObject({ compareUnit: "szt", factor: 1, packKey: "", packTier: "szt" });
    expect(priceBasis("Czosnek 3 szt", "opak")).toMatchObject({ compareUnit: "szt", packTier: "szt" });
    expect(priceBasis("Czosnek 3 szt", "opak").factor).toBeCloseTo(1 / 3, 6);
    expect(priceBasis("Pieczarki", "g").compareUnit).toBe("kg");
  });
  it.each([
    ["[PRYMAT] CZOSNEK GRANULOWANY 1,05KG PET", 1.05, "kg"],
    ["CUKIER MK CAFE PALUSZKI 1000 SZT x 5g", 5, "kg"],
    ["MALINA GRYS 2,5KG [4SZT] {ABEL}", 2.5, "kg"],
    ["OLIWA Z OLIWEK CZOSNEK I CHILLI 250ML [6SZT] {MONINI}", 0.25, "l"],
    ["SER CHEDDAR PLASTRY 1KG [6SZT] {MLEKOVITA}", 1, "kg"],
    ["Mleko UHT 6x1l", 6, "l"],
    ["[SCHOLLER] KUWETA SORBET MALINOWY 5L", 5, "l"],
  ])("parsePack(„%s”) = %s %s", (name, total, base) => {
    const p = parsePack(name);
    expect(p?.base).toBe(base);
    expect(p?.total).toBeCloseTo(total as number, 5);
  });
  it("bez gramatury albo nierealna → null", () => {
    expect(parsePack("Awokado zielone Hiszpania")).toBeNull();
    expect(parsePack("Worki 120l 10 szt")).toBeNull(); // 120 l to nie opakowanie towaru — poza zakresem
  });
});

describe("drugi przegląd porównania cen (2026-10-11)", () => {
  it.each([
    ["Cebulki całe w occie balsamicznym 860g Ginos", "Cebula"],
    ["MALINA GRYS 2,5KG [4SZT] {ABEL}", "Malina"],
    ["ANTRYKOT B/K DOJRZEWAJĄCY PREMIUM STEK", "Antrykot"],
    ["Filet z kurczaka panierowany", "Filet z kurczaka"],
  ])("„%s” nie jest produktem bazowym %s", (name, wrong) => {
    expect(genericProduct(name)?.label).not.toBe(wrong);
  });
  it("zwykłe elementy mięsa nadal działają", () => {
    expect(genericProduct("Antrykot b/k")?.label).toBe("Antrykot");
    expect(genericProduct("Filet z piersi kurczaka")?.label).toBe("Filet z kurczaka");
    expect(genericProduct("Mozzarella mini kulki 750g")?.label).toBe("Mozzarella");
  });
});

describe("nie-żywność i kwasek (2026-10-11, trzeci zrzut)", () => {
  it.each([
    ["GAR KUBUŚ PŁ.D/NACZYŃ 5L MIĘTA KARNISTER", "Mięta"],
    ["[JARBAB] KWASEK CYTRYNOWY 1KG", "Cytryna"],
  ])("„%s” nie jest %s", (name, wrong) => {
    expect(genericProduct(name)?.label).not.toBe(wrong);
  });
  it("chemia i opakowania to nie żywność", () => {
    expect(isNonFood("GAR KUBUŚ PŁ.D/NACZYŃ 5L MIĘTA KARNISTER")).toBe(true);
    expect(isNonFood("Worki na śmieci 120l")).toBe(true);
    expect(isNonFood("Rękawice nitrylowe M")).toBe(true);
    expect(isNonFood("Mięta świeża")).toBe(false);
    expect(isNonFood("Pomidor LIMA II PL")).toBe(false);
  });
});

describe("spec benchmark v2 — tabela nazw (etap 3)", () => {
  it.each([
    ["Vegeburger z kalafiora 1,5kg Cook Vege", null, "dish"],
    ["[BONDUELLE] BRUNOISE KALAFIOR DROBNA KOSTKA 2,5KG", null, "processed"],
    ["Pomidory pelati 2,5kg", null, "processed"],
    ["Masło roślinne 250g", null, "plant_based"],
    ["Filet z kurczaka mrożony 2,5kg", null, "frozen"],
    ["Mozzarella di bufala 125g", null, "processed"],
    ["Mozzarella tarta 2kg", null, "processed"],
  ])("„%s” → %s (powód: %s)", (name, label, reason) => {
    expect(genericProduct(name)?.label ?? null).toBe(label);
    expect(skipReason(name)).toBe(reason);
  });
  it("ogórki małosolne mają własny wpis", () => {
    expect(genericProduct("Ogórki małosolne luz polski")?.label).toBe("Ogórek małosolny");
  });
  it("jaja w opakowaniu → cena za sztukę", () => {
    const b = priceBasis("Jaja L 30 szt", "opak");
    expect(genericProduct("Jaja L 30 szt")?.label).toBe("Jaja");
    expect(b.compareUnit).toBe("szt");
    expect(b.factor).toBeCloseTo(1 / 30, 6);
    expect(b.packTier).toBe("szt");
  });
  it("regresja: przeliczenia, które działały", () => {
    expect(priceBasis("Masło extra 82% 200g", "szt")).toMatchObject({ compareUnit: "kg", factor: 5, packTier: "S" });
    expect(priceBasis("Mozzarella 125g", "szt")).toMatchObject({ compareUnit: "kg", factor: 8, packTier: "S" });
    expect(priceBasis("Mleko UHT 12x1l", "opak").compareUnit).toBe("l");
    expect(priceBasis("Mleko UHT 12x1l", "opak").factor).toBeCloseTo(1 / 12, 6);
    expect(priceBasis("Cukier 25kg", "szt")).toMatchObject({ factor: 0.04, packTier: "L" });
    expect(priceBasis("Cukier biały 1kg", "szt").packTier).toBe("S");
    expect(priceBasis("Śmietana 30% 1l", "szt")).toMatchObject({ compareUnit: "l", factor: 1 });
    expect(priceBasis("Pieczarki 3kg", "szt").packTier).toBe("M");
    expect(genericProduct("Masło extra 82% 200g")?.label).toBe("Masło");
    expect(genericProduct("Mozzarella 125g")?.label).toBe("Mozzarella");
    expect(genericProduct("Cytryny")?.label).toBe("Cytryna");
    expect(genericProduct("Schab b/k")?.label).toBe("Schab");
    expect(genericProduct("Pieczarki 3kg")?.label).toBe("Pieczarki");
    expect(genericProduct("Śmietana 30% UHT 1l")?.label).toBe("Śmietana 30%");
  });
  it("cukier 1 kg i 25 kg to różne przedziały", () => {
    expect(priceBasis("Cukier 1kg", "szt").packTier).not.toBe(priceBasis("Cukier 25kg", "szt").packTier);
  });
});
