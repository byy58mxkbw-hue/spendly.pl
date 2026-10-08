import { describe, it, expect } from "vitest";
import { countComparable } from "./market-match";

// Klucze w formacie z fetchMarketKeys: `${nazwa bazowa}::${jednostka}`.
const KEYS = new Set(["cytryna::kg", "mieta::kg", "pieczarki::kg"]);

describe("countComparable", () => {
  it("dopasowuje warianty nazw przez słownik bazowy i wymaga zgodnej jednostki", () => {
    const items = [
      { name: "CYTRYNY ARGENTYNA KL.I", unit: "KG" },
      { name: "Pieczarki krajowe", unit: "kg." },
      { name: "Cytryna", unit: "szt" }, // inna jednostka — nie liczymy
      { name: "Rioba sok z cytryny", unit: "kg" }, // przetworzony — nie świeża cytryna
      { name: "Bazylia w doniczce", unit: "szt" }, // brak na liście
    ];
    expect(countComparable(items, KEYS)).toBe(2);
  });
});
