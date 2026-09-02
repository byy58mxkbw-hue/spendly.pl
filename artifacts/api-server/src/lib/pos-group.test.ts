import { describe, it, expect } from "vitest";
import { commonWordPrefix, groupPosByProduct, posGroupKey } from "./pos-group";

describe("commonWordPrefix", () => {
  it("wyciąga nazwę bazową ze stopni wysmażenia", () => {
    expect(
      commonWordPrefix([
        "Stek z Polędwicy Wołowej Medium",
        "Stek z Polędwicy Wołowej Well Done",
        "Stek z Polędwicy Wołowej Medium rare",
      ]),
    ).toBe("Stek z Polędwicy Wołowej");
  });

  it("tnie po CAŁYCH słowach, nie po znakach", () => {
    // Wspólny prefiks znakowy to „Stek z rostbefu ", ale „Medium"/„Medium well"
    // dzielą jeszcze słowo „Medium" — i tak ma zostać.
    expect(commonWordPrefix(["Stek z rostbefu Medium", "Stek z rostbefu Medium well"])).toBe(
      "Stek z rostbefu Medium",
    );
  });

  it("nie skleja pozycji bez wspólnego początku — zwraca pierwszą nazwę", () => {
    expect(commonWordPrefix(["Frytki stekowe", "Surówka"])).toBe("Frytki stekowe");
  });

  it("pojedyncza nazwa zostaje sobą", () => {
    expect(commonWordPrefix(["Stek z antrykotu Rare"])).toBe("Stek z antrykotu Rare");
  });

  it("ignoruje wielkość liter przy porównaniu, ale zachowuje oryginalną pisownię", () => {
    expect(commonWordPrefix(["Stek z Antrykotu Medium", "Stek z antrykotu Rare"])).toBe("Stek z Antrykotu");
  });
});

describe("posGroupKey", () => {
  it("id produktu z POS ma pierwszeństwo przed nazwą", () => {
    const a = posGroupKey({ name: "Stek z antrykotu Medium", posProductId: "77" });
    const b = posGroupKey({ name: "Stek z antrykotu Rare", posProductId: "77" });
    expect(a).toBe(b);
  });

  it("bez id grupuje po znormalizowanej nazwie", () => {
    const a = posGroupKey({ name: "  Frytki  stekowe ", posProductId: null });
    const b = posGroupKey({ name: "frytki stekowe", posProductId: null });
    expect(a).toBe(b);
  });

  it("różne id to różne grupy, nawet przy podobnej nazwie", () => {
    const a = posGroupKey({ name: "Lunch dnia", posProductId: "1" });
    const b = posGroupKey({ name: "Lunch dnia", posProductId: "2" });
    expect(a).not.toBe(b);
  });
});

describe("groupPosByProduct", () => {
  it("skleja warianty w jedną pozycję i sumuje ilość oraz wartość", () => {
    const groups = groupPosByProduct([
      { name: "Stek z Polędwicy Wołowej Medium", posProductId: "10", qty: 56, net: 7000 },
      { name: "Stek z Polędwicy Wołowej Well Done", posProductId: "10", qty: 15, net: 1875 },
      { name: "Stek z Polędwicy Wołowej Rare", posProductId: "10", qty: 4, net: 500 },
      { name: "Frytki stekowe przekąski", posProductId: "20", qty: 13, net: 325 },
    ]);

    expect(groups).toHaveLength(2);
    const stek = groups.find((g) => g.name.startsWith("Stek"))!;
    expect(stek.name).toBe("Stek z Polędwicy Wołowej");
    expect(stek.qty).toBe(75);
    expect(stek.net).toBe(9375);
    expect(stek.members).toHaveLength(3);

    const frytki = groups.find((g) => g.name.startsWith("Frytki"))!;
    expect(frytki.members).toHaveLength(1);
  });

  it("suma grup równa się sumie wejścia — nic nie ginie ani nie dubluje się", () => {
    const rows = [
      { name: "Stek z antrykotu Medium", posProductId: "1", qty: 22, net: 3116.67 },
      { name: "Stek z antrykotu Rare", posProductId: "1", qty: 5, net: 708.33 },
      { name: "Stek z rostbefu Medium", posProductId: "2", qty: 22, net: 3014.81 },
      { name: "Kawa", posProductId: null, qty: 300, net: 1200 },
    ];
    const groups = groupPosByProduct(rows);
    const sumIn = rows.reduce((s, r) => s + r.net, 0);
    const sumOut = groups.reduce((s, g) => s + g.net, 0);
    expect(sumOut).toBeCloseTo(sumIn, 6);
  });

  it("klucz grupy jest zwracany — porównania m/m muszą iść po nim, nie po nazwie", () => {
    const groups = groupPosByProduct([
      { name: "Stek z rostbefu Medium", posProductId: "5", qty: 1, net: 10 },
    ]);
    expect(groups[0].key).toBe("id:5");
  });
});
