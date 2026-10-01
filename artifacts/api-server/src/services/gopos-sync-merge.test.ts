import { describe, it, expect } from "vitest";
import { mergeSalesByName } from "./gopos-sync";
import { dishFoodCostPct, dishMarginPct, netSellPrice } from "../lib/food-cost-math";

// Audyt spójności 2026-10-01: synchronizacja GoPOS nadpisywała sprzedaż produktów
// o tej samej nazwie (ostatni wiersz wygrywał), a food cost dzielił koszt netto
// przez cenę brutto.

describe("mergeSalesByName", () => {
  it("sumuje dwa produkty GoPOS o tej samej nazwie zamiast nadpisywać", () => {
    const merged = mergeSalesByName([
      { name: "Schabowy", productId: "10", category: "DANIA GŁÓWNE", qty: 40, net: 1600 },
      { name: "Schabowy", productId: "20", category: "LUNCH", qty: 15, net: 450 },
      { name: "Żurek", productId: "30", category: "ZUPY", qty: 5, net: 100 },
    ]);
    expect(merged.get("Schabowy")).toMatchObject({ qty: 55, net: 2050, productId: "10", category: "DANIA GŁÓWNE" });
    expect(merged.get("Żurek")).toMatchObject({ qty: 5, net: 100 });
  });

  it("id i kategoria pochodzą z pozycji o największej sprzedaży", () => {
    const merged = mergeSalesByName([
      { name: "Kawa", productId: "1", category: "INNE", qty: 2, net: 20 },
      { name: "Kawa", productId: "2", category: "NAPOJE", qty: 30, net: 300 },
    ]);
    expect(merged.get("Kawa")).toMatchObject({ qty: 32, net: 320, productId: "2", category: "NAPOJE" });
  });
});

describe("food cost netto/netto", () => {
  it("sprowadza cenę z karty do netto (8% VAT)", () => {
    expect(netSellPrice(108)).toBeCloseTo(100, 6);
  });

  it("barszcz z audytu: 7,29 zł kosztu przy cenie 15 zł brutto to 52,5%, nie 48,6%", () => {
    expect(dishFoodCostPct(7.29, 15)).toBe(52.5);
    expect(dishMarginPct(7.29, 15)).toBe(47.5);
  });

  it("brak kosztu albo ceny daje null", () => {
    expect(dishFoodCostPct(null, 15)).toBeNull();
    expect(dishFoodCostPct(5, 0)).toBeNull();
    expect(dishMarginPct(null, 15)).toBeNull();
  });
});
