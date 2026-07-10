import { describe, it, expect } from "vitest";
import { normalizeUnit } from "./units";

describe("normalizeUnit", () => {
  it("normalizuje warianty kg do jednego klucza", () => {
    expect(normalizeUnit("kg")).toBe("kg");
    expect(normalizeUnit("KG")).toBe("kg");
    expect(normalizeUnit("kg.")).toBe("kg");
    expect(normalizeUnit(" Kg ")).toBe("kg");
  });

  it("normalizuje warianty sztuk do jednego klucza", () => {
    expect(normalizeUnit("szt")).toBe("szt");
    expect(normalizeUnit("szt.")).toBe("szt");
    expect(normalizeUnit("sztuka")).toBe("szt");
    expect(normalizeUnit("SZTUKI")).toBe("szt");
  });

  it("normalizuje litry i mililitry osobno", () => {
    expect(normalizeUnit("l")).toBe("l");
    expect(normalizeUnit("litr")).toBe("l");
    expect(normalizeUnit("ml")).toBe("ml");
    expect(normalizeUnit("l")).not.toBe(normalizeUnit("ml"));
  });

  it("normalizuje opakowania", () => {
    expect(normalizeUnit("opak")).toBe("opak");
    expect(normalizeUnit("op.")).toBe("opak");
    expect(normalizeUnit("opakowanie")).toBe("opak");
  });

  it("traktuje nieznane jednostki jako oczyszczony lowercase", () => {
    expect(normalizeUnit("paczka")).toBe("paczka");
    expect(normalizeUnit("Paczka")).toBe("paczka");
  });

  it("obsługuje null/undefined/pusty string", () => {
    expect(normalizeUnit(null)).toBe("");
    expect(normalizeUnit(undefined)).toBe("");
    expect(normalizeUnit("")).toBe("");
  });

  it("kg i szt to różne jednostki (nie mieszamy przy porównaniu cen)", () => {
    expect(normalizeUnit("kg")).not.toBe(normalizeUnit("szt"));
  });
});
