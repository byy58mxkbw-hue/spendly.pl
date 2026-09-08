import { describe, it, expect } from "vitest";
import { CATEGORIES, categorizeProduct } from "./categories";

// Smoke test: frontend re-eksportuje @workspace/category-rules (koniec rozjazdu
// front/backend — wcześniej ten plik miał WŁASNĄ, gorszą implementację).
describe("categories.ts (re-eksport @workspace/category-rules)", () => {
  it("CATEGORIES to niepusta lista z polami id/label/emoji", () => {
    expect(CATEGORIES.length).toBeGreaterThan(5);
    for (const c of CATEGORIES) {
      expect(typeof c.id).toBe("string");
      expect(typeof c.label).toBe("string");
      expect(typeof c.emoji).toBe("string");
    }
  });

  it("categorizeProduct używa tego samego, poprawionego silnika co backend (granica słowa)", () => {
    expect(categorizeProduct("ser cheddar")).toBe("sery");
    // Regresja P1: front miał kiedyś goły includes() bez granicy słowa —
    // "koneser" (olej) nie może już trafić do "sery".
    expect(categorizeProduct("[KONESER GO] FRYTURA RZEPAKOWA")).not.toBe("sery");
  });
});
