import { describe, it, expect } from "vitest";
import { stripDiacritics, bucketKey, pickGroupKey, modalCategory, UnionFind } from "./market-product-matcher";

describe("stripDiacritics", () => {
  it("usuwa polskie diakrytyki", () => {
    expect(stripDiacritics("łosoś śledź żółty")).toBe("losos sledz zolty");
  });
});

describe("bucketKey", () => {
  it("obcina końcówkę liczby mnogiej dla słów >4 znaki", () => {
    expect(bucketKey("pomidory")).toBe("pomidor");
    expect(bucketKey("POMIDORY")).toBe("pomidor");
  });

  it("nie obcina krótkich słów (<=4 znaki)", () => {
    expect(bucketKey("sery")).toBe("sery");
  });

  it("normalizuje diakrytyki przed obcięciem", () => {
    expect(bucketKey("Łopatki")).toBe("lopatk");
  });
});

describe("pickGroupKey", () => {
  it("wybiera wariant z największą liczbą różnych userów", () => {
    const key = pickGroupKey([
      { canonicalName: "pomidor", unit: "kg", category: "warzywa", userCount: 3 },
      { canonicalName: "pomidory", unit: "kg", category: "warzywa", userCount: 12 },
      { canonicalName: "p0midor", unit: "kg", category: "warzywa", userCount: 1 },
    ]);
    expect(key).toBe("pomidory");
  });

  it("przy remisie wybiera alfabetycznie pierwszy (deterministyczne)", () => {
    const key = pickGroupKey([
      { canonicalName: "zzz", unit: "kg", category: null, userCount: 5 },
      { canonicalName: "aaa", unit: "kg", category: null, userCount: 5 },
    ]);
    expect(key).toBe("aaa");
  });
});

describe("modalCategory", () => {
  it("wybiera kategorię występującą najczęściej", () => {
    expect(
      modalCategory([{ category: "warzywa" }, { category: "warzywa" }, { category: "nabial" }]),
    ).toBe("warzywa");
  });

  it("zwraca null gdy brak kategorii", () => {
    expect(modalCategory([{ category: null }, { category: null }])).toBeNull();
  });
});

describe("UnionFind", () => {
  it("łączy elementy w tę samą grupę (root)", () => {
    const uf = new UnionFind();
    uf.union("pomidor", "pomidory");
    uf.union("pomidory", "p0midor");
    expect(uf.find("pomidor")).toBe(uf.find("p0midor"));
  });

  it("nie łączy niepowiązanych elementów", () => {
    const uf = new UnionFind();
    uf.union("pomidor", "pomidory");
    uf.find("ser"); // singleton, nigdy nie unione'owany
    expect(uf.find("pomidor")).not.toBe(uf.find("ser"));
  });
});
