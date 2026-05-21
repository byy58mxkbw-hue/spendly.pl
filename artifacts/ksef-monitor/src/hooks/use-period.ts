import { useState, useEffect } from "react";

export type Period = "month" | "quarter" | "year";

const STORAGE_KEY = "cennikpro-period";
const DEFAULT_PERIOD: Period = "month";

export function usePeriod() {
  const [period, setPeriodState] = useState<Period>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === "month" || stored === "quarter" || stored === "year") return stored;
    } catch {}
    return DEFAULT_PERIOD;
  });

  function setPeriod(p: Period) {
    setPeriodState(p);
    try { localStorage.setItem(STORAGE_KEY, p); } catch {}
  }

  return { period, setPeriod };
}

export function periodToDays(period: Period): number {
  const now = new Date();
  if (period === "month") {
    // Days elapsed since the 1st of the current calendar month
    return now.getDate() - 1;
  }
  if (period === "quarter") {
    // Start of the month 2 months before the current one (e.g. May → March 1)
    const start = new Date(now.getFullYear(), now.getMonth() - 2, 1);
    return Math.round((now.getTime() - start.getTime()) / 86_400_000);
  }
  // year: January 1 of the current year
  const start = new Date(now.getFullYear(), 0, 1);
  return Math.round((now.getTime() - start.getTime()) / 86_400_000);
}

export function periodToMonths(period: Period): number {
  if (period === "month") return 1;
  if (period === "quarter") return 3;
  return 12;
}

export const PERIOD_LABELS: Record<Period, string> = {
  month: "Ten miesiąc",
  quarter: "3 miesiące",
  year: "Rok",
};
