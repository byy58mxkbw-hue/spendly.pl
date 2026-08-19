// Testy rankingu zmian ILOŚCI. Każdy przypadek pilnuje jednej pułapki, przez którą
// karta pokazałaby użytkownikowi nieprawdę o jego zamówieniach.
import { describe, expect, it } from "vitest";
import { rankQuantityChanges } from "./quantity-changes";

type Row = {
  productName: string; unit: string; totalQuantity: number; totalCost: number;
  prevMonthTotalQuantity?: number | null;
};

// Minimalny wiersz — tylko pola, na których operuje ranking.
function row(p: { productName: string; unit: string; totalQuantity: number; avgPrice?: number; totalCost?: number; prevMonthTotalQuantity?: number | null; supplierName?: string }): Row {
  return {
    productName: p.productName,
    unit: p.unit,
    totalQuantity: p.totalQuantity,
    totalCost: p.totalCost ?? p.totalQuantity * (p.avgPrice ?? 10),
    prevMonthTotalQuantity: p.prevMonthTotalQuantity,
  };
}

describe("rankQuantityChanges", () => {
  it("pomija produkt bez poprzedniej ilości zamiast pokazywać go jako 'bez zmian'", () => {
    // computeImpacts zeruje qtyPct przy braku historii — gdyby ranking na tym polegał,
    // nowy produkt wyglądałby na stabilny.
    const { up, down, skipped } = rankQuantityChanges([
      row({ productName: "Nowy towar", unit: "kg", totalQuantity: 100, prevMonthTotalQuantity: null }),
    ]);
    expect(up).toHaveLength(0);
    expect(down).toHaveLength(0);
    expect(skipped).toBe(1);
  });

  it("NIE sumuje różnych jednostek tego samego produktu", () => {
    // „Mąka 50 kg" i „Mąka 3 opak" to dwie różne rzeczy. Zsumowanie dałoby 53 czegoś.
    const { up } = rankQuantityChanges([
      row({ productName: "Mąka", unit: "kg", totalQuantity: 150, prevMonthTotalQuantity: 100 }),
      row({ productName: "Mąka", unit: "opak", totalQuantity: 30, prevMonthTotalQuantity: 10 }),
    ]);
    expect(up).toHaveLength(2);
    expect(up.map((r) => r.unit).sort()).toEqual(["kg", "opak"]);
    expect(up.every((r) => r.qty < 200)).toBe(true);
  });

  it("sumuje tego samego dostawcę-do-dostawcy w jeden wiersz i liczy dostawców", () => {
    // /reports/monthly zwraca wiersz per dostawcę — bez sumowania karta pokazałaby
    // połowę zamówienia.
    const { up } = rankQuantityChanges([
      row({ productName: "Pomidory", unit: "kg", totalQuantity: 60, prevMonthTotalQuantity: 40, supplierName: "A" }),
      row({ productName: "Pomidory", unit: "kg", totalQuantity: 40, prevMonthTotalQuantity: 40, supplierName: "B" }),
    ]);
    expect(up).toHaveLength(1);
    expect(up[0].qty).toBe(100);
    expect(up[0].prevQty).toBe(80);
    expect(up[0].supplierCount).toBe(2);
    expect(up[0].qtyPct).toBeCloseTo(25, 5);
  });

  it("odrzuca grupę, w której choć jeden dostawca nie ma historii (rotacja dostawców)", () => {
    // Gdyby policzyć, wyszedłby fałszywy wzrost: nowy dostawca dokłada ilość,
    // ale jego poprzedni okres nie istnieje.
    const { up, skipped } = rankQuantityChanges([
      row({ productName: "Ser", unit: "kg", totalQuantity: 50, prevMonthTotalQuantity: 50, supplierName: "A" }),
      row({ productName: "Ser", unit: "kg", totalQuantity: 50, prevMonthTotalQuantity: null, supplierName: "B" }),
    ]);
    expect(up).toHaveLength(0);
    expect(skipped).toBe(1);
  });

  it("odsiewa drobiazgi — duży procent na groszowej bazie nie wypycha realnych zmian", () => {
    const { up } = rankQuantityChanges([
      // +200%, ale wartościowo 2 kg × 1 zł = 2 zł → poniżej progu
      row({ productName: "Drobiazg", unit: "kg", totalQuantity: 3, prevMonthTotalQuantity: 1, avgPrice: 1 }),
      // +25%, ale 20 kg × 50 zł = 1000 zł → istotne
      row({ productName: "Polędwica", unit: "kg", totalQuantity: 100, prevMonthTotalQuantity: 80, avgPrice: 50 }),
    ]);
    expect(up.map((r) => r.productName)).toEqual(["Polędwica"]);
  });

  it("sortuje po procencie, nie po delcie w jednostkach", () => {
    // Delta w jednostkach postawiłaby serwetki (+400 szt.) nad polędwicą (+30 kg).
    const { up } = rankQuantityChanges([
      row({ productName: "Serwetki", unit: "szt", totalQuantity: 1400, prevMonthTotalQuantity: 1000, avgPrice: 1 }),
      row({ productName: "Polędwica", unit: "kg", totalQuantity: 60, prevMonthTotalQuantity: 30, avgPrice: 50 }),
    ]);
    expect(up[0].productName).toBe("Polędwica"); // +100% > +40%
  });

  it("rozdziela wzrosty i spadki, każdy posortowany od najmocniejszego", () => {
    const { up, down } = rankQuantityChanges([
      row({ productName: "Rośnie mocno", unit: "kg", totalQuantity: 200, prevMonthTotalQuantity: 100, avgPrice: 20 }),
      row({ productName: "Rośnie słabo", unit: "kg", totalQuantity: 110, prevMonthTotalQuantity: 100, avgPrice: 20 }),
      row({ productName: "Spada mocno", unit: "kg", totalQuantity: 20, prevMonthTotalQuantity: 100, avgPrice: 20 }),
      row({ productName: "Spada słabo", unit: "kg", totalQuantity: 90, prevMonthTotalQuantity: 100, avgPrice: 20 }),
    ]);
    expect(up.map((r) => r.productName)).toEqual(["Rośnie mocno", "Rośnie słabo"]);
    expect(down.map((r) => r.productName)).toEqual(["Spada mocno", "Spada słabo"]);
  });

  it("scala warianty zapisu jednostki (kg / KG / kg.)", () => {
    const { up } = rankQuantityChanges([
      row({ productName: "Cukier", unit: "kg", totalQuantity: 60, prevMonthTotalQuantity: 40 }),
      row({ productName: "Cukier", unit: "KG", totalQuantity: 40, prevMonthTotalQuantity: 40 }),
      row({ productName: "Cukier", unit: "kg.", totalQuantity: 20, prevMonthTotalQuantity: 20 }),
    ]);
    expect(up).toHaveLength(1);
    expect(up[0].qty).toBe(120);
  });
});
