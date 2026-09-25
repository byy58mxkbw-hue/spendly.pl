import { describe, it, expect } from "vitest";
import { isAdvanceSettlementLine } from "./invoice-line-classify.js";

describe("isAdvanceSettlementLine", () => {
  it("łapie typowe warianty rozliczenia zaliczki", () => {
    expect(isAdvanceSettlementLine("Zaliczka 23% VAT")).toBe(true);
    expect(isAdvanceSettlementLine("zaliczka")).toBe(true);
    expect(isAdvanceSettlementLine("Rozliczenie zaliczki 23% VAT")).toBe(true);
    expect(isAdvanceSettlementLine("ZALICZKOWA WPŁATA")).toBe(true);
  });

  it("nie łapie realnych nazw produktów", () => {
    expect(isAdvanceSettlementLine("drewno sosnowe WCO kl.wym.2/02.20.11.0")).toBe(false);
    expect(isAdvanceSettlementLine("Mleko 3.2%")).toBe(false);
    expect(isAdvanceSettlementLine("Masło")).toBe(false);
  });

  it("granica słowa — nie łapie 'zaliczk' w środku innego słowa", () => {
    expect(isAdvanceSettlementLine("Przedzaliczkowanko")).toBe(false);
  });
});
