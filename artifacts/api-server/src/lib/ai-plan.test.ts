import { describe, it, expect } from "vitest";
import { AI_MONTHLY_LIMIT, normalizePlan, currentPeriod } from "./ai-plan";

// Faza 2.4 — limity AI per plan.
describe("ai-plan: limity miesięczne", () => {
  it("free 50 / pro 1000 / business ∞", () => {
    expect(AI_MONTHLY_LIMIT.free).toBe(50);
    expect(AI_MONTHLY_LIMIT.pro).toBe(1000);
    expect(AI_MONTHLY_LIMIT.business).toBeNull();
  });
});

describe("ai-plan: normalizePlan", () => {
  it("rozpoznaje pro/business, resztę traktuje jako free", () => {
    expect(normalizePlan("pro")).toBe("pro");
    expect(normalizePlan("business")).toBe("business");
    expect(normalizePlan("free")).toBe("free");
  });
  it("nieznane/puste/zły typ → free (fail-safe, najniższy plan)", () => {
    expect(normalizePlan(undefined)).toBe("free");
    expect(normalizePlan(null)).toBe("free");
    expect(normalizePlan("FREE")).toBe("free"); // case-sensitive z założenia
    expect(normalizePlan("enterprise")).toBe("free");
    expect(normalizePlan({ plan: "pro" })).toBe("free");
  });
});

describe("ai-plan: currentPeriod (Europe/Warsaw)", () => {
  it("format YYYY-MM", () => {
    expect(currentPeriod(new Date("2026-07-07T10:00:00Z"))).toMatch(/^\d{4}-\d{2}$/);
  });
  it("liczy miesiąc w strefie Warszawy, nie UTC", () => {
    // 30 czerwca 23:30 UTC = 1 lipca 01:30 w Warszawie (lato, UTC+2) → lipiec
    expect(currentPeriod(new Date("2026-06-30T23:30:00Z"))).toBe("2026-07");
    expect(currentPeriod(new Date("2026-07-07T10:00:00Z"))).toBe("2026-07");
  });
});
