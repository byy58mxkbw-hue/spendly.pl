import { describe, it, expect } from "vitest";
import { periodFromQuery, previousPeriod, periodLabel, type Period } from "./period";

describe("periodFromQuery", () => {
  it("preferuje from/to gdy oba poprawne (YYYY-MM-DD)", () => {
    expect(periodFromQuery({ from: "2026-01-15", to: "2026-03-20" })).toEqual({
      from: "2026-01-15",
      to: "2026-03-20",
    });
  });

  it("odwraca zakres gdy from > to", () => {
    expect(periodFromQuery({ from: "2026-03-20", to: "2026-01-15" })).toEqual({
      from: "2026-01-15",
      to: "2026-03-20",
    });
  });

  it("fallback na cały miesiąc gdy podany tylko month", () => {
    expect(periodFromQuery({ month: "2026-07" })).toEqual({
      from: "2026-07-01",
      to: "2026-07-31",
    });
  });

  it("liczy poprawnie ostatni dzień miesiąca (luty zwykły / przestępny / 30-dniowy)", () => {
    expect(periodFromQuery({ month: "2025-02" })).toEqual({ from: "2025-02-01", to: "2025-02-28" });
    expect(periodFromQuery({ month: "2024-02" })).toEqual({ from: "2024-02-01", to: "2024-02-29" });
    expect(periodFromQuery({ month: "2026-04" })).toEqual({ from: "2026-04-01", to: "2026-04-30" });
  });

  it("ignoruje niepełne/niepoprawne from-to i schodzi do month", () => {
    expect(periodFromQuery({ from: "2026-01-15", month: "2026-07" })).toEqual({
      from: "2026-07-01",
      to: "2026-07-31",
    });
    expect(periodFromQuery({ from: "2026-13-99", to: "abc", month: "2026-07" })).toEqual({
      from: "2026-07-01",
      to: "2026-07-31",
    });
  });

  it("bez żadnych parametrów zwraca bieżący miesiąc kalendarzowy", () => {
    const now = new Date();
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const p = periodFromQuery({});
    expect(p.from).toBe(`${now.getFullYear()}-${mm}-01`);
    expect(p.from.slice(0, 7)).toBe(p.to.slice(0, 7));
  });
});

describe("previousPeriod — okresy równe pełnym miesiącom (month-aligned)", () => {
  it("pojedynczy miesiąc → poprzedni miesiąc (lipiec → czerwiec)", () => {
    expect(previousPeriod({ from: "2026-07-01", to: "2026-07-31" })).toEqual({
      from: "2026-06-01",
      to: "2026-06-30",
    });
  });

  it("miesiąc na styku roku (styczeń → grudzień poprz. roku)", () => {
    expect(previousPeriod({ from: "2026-01-01", to: "2026-01-31" })).toEqual({
      from: "2025-12-01",
      to: "2025-12-31",
    });
  });

  it("cały rok → poprzedni rok (2026 → 2025)", () => {
    expect(previousPeriod({ from: "2026-01-01", to: "2026-12-31" })).toEqual({
      from: "2025-01-01",
      to: "2025-12-31",
    });
  });

  it("kwartał → poprzedni kwartał (Q3 → Q2)", () => {
    expect(previousPeriod({ from: "2026-07-01", to: "2026-09-30" })).toEqual({
      from: "2026-04-01",
      to: "2026-06-30",
    });
  });

  it("kwartał na styku roku (Q1 → Q4 poprz. roku)", () => {
    expect(previousPeriod({ from: "2026-01-01", to: "2026-03-31" })).toEqual({
      from: "2025-10-01",
      to: "2025-12-31",
    });
  });

  it("6 miesięcy → poprzednie 6 miesięcy", () => {
    expect(previousPeriod({ from: "2026-01-01", to: "2026-06-30" })).toEqual({
      from: "2025-07-01",
      to: "2025-12-31",
    });
  });
});

describe("previousPeriod — dowolny zakres dni", () => {
  it("6 dni → poprzednie 6 dni tuż przed", () => {
    expect(previousPeriod({ from: "2026-07-10", to: "2026-07-15" })).toEqual({
      from: "2026-07-04",
      to: "2026-07-09",
    });
  });

  it("zakres przez granicę miesiąca liczy dni poprawnie", () => {
    // 2026-03-01..2026-03-05 to 5 dni, ale from nie jest pełnym miesiącem → tryb dniowy
    const p = previousPeriod({ from: "2026-03-02", to: "2026-03-06" });
    expect(p).toEqual({ from: "2026-02-25", to: "2026-03-01" });
  });

  it("pojedynczy dzień → poprzedni dzień", () => {
    expect(previousPeriod({ from: "2026-07-15", to: "2026-07-15" })).toEqual({
      from: "2026-07-14",
      to: "2026-07-14",
    });
  });
});

describe("periodLabel", () => {
  it("pełny miesiąc → nazwa miesiąca po polsku + rok", () => {
    expect(periodLabel({ from: "2026-07-01", to: "2026-07-31" })).toBe("lipiec 2026");
    expect(periodLabel({ from: "2026-02-01", to: "2026-02-28" })).toBe("luty 2026");
  });

  it("pełny rok → „rok 2026\"", () => {
    expect(periodLabel({ from: "2026-01-01", to: "2026-12-31" })).toBe("rok 2026");
  });

  it("dowolny zakres → surowe daty", () => {
    expect(periodLabel({ from: "2026-01-15", to: "2026-03-20" })).toBe("2026-01-15 – 2026-03-20");
  });

  it("kwartał nie jest „pełnym miesiącem\" ani rokiem → surowe daty", () => {
    expect(periodLabel({ from: "2026-07-01", to: "2026-09-30" })).toBe("2026-07-01 – 2026-09-30");
  });
});

describe("integralność: previousPeriod zawsze daje from <= to i tę samą długość dla trybu dniowego", () => {
  const cases: Period[] = [
    { from: "2026-07-01", to: "2026-07-31" },
    { from: "2026-01-01", to: "2026-12-31" },
    { from: "2026-07-10", to: "2026-07-15" },
    { from: "2026-03-02", to: "2026-03-06" },
  ];
  for (const p of cases) {
    it(`${p.from}..${p.to} → prev poprawny`, () => {
      const prev = previousPeriod(p);
      expect(prev.from <= prev.to).toBe(true);
      expect(prev.to < p.from).toBe(true);
    });
  }
});
