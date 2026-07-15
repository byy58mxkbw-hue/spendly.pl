import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

// Okres raportów [from, to] (YYYY-MM-DD, włącznie). Zastępuje „miesiąc"; pojedynczy
// miesiąc = preset „ten miesiąc". previousPeriod/periodLabel to bliźniak backendu
// (artifacts/api-server/src/lib/period.ts) — trzymać spójnie.
export type Period = { from: string; to: string };
export type PresetKey = "this-month" | "last-3m" | "last-6m" | "year" | "custom";

const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
const lastDay = (y: number, m1: number) => new Date(Date.UTC(y, m1, 0)).getUTCDate();
const monthRange = (y: number, m1: number): Period => ({ from: `${y}-${pad(m1)}-01`, to: `${y}-${pad(m1)}-${pad(lastDay(y, m1))}` });

function presetPeriod(preset: PresetKey, now = new Date()): Period {
  const y = now.getFullYear();
  const m = now.getMonth() + 1;
  if (preset === "year") return { from: `${y}-01-01`, to: `${y}-12-31` };
  if (preset === "last-3m" || preset === "last-6m") {
    const n = preset === "last-3m" ? 3 : 6;
    const start = new Date(Date.UTC(y, m - 1 - (n - 1), 1));
    return { from: `${start.getUTCFullYear()}-${pad(start.getUTCMonth() + 1)}-01`, to: monthRange(y, m).to };
  }
  return monthRange(y, m); // this-month (i domyślny)
}

const isFirstOfMonth = (d: string) => d.slice(8, 10) === "01";
const isLastOfMonth = (d: string) => {
  const [y, m, day] = d.split("-").map(Number);
  return day === lastDay(y, m);
};

export function previousPeriod(p: Period): Period {
  if (isFirstOfMonth(p.from) && isLastOfMonth(p.to)) {
    const [fy, fm] = p.from.split("-").map(Number);
    const [ty, tm] = p.to.split("-").map(Number);
    const months = (ty - fy) * 12 + (tm - fm) + 1;
    const pf = new Date(Date.UTC(fy, fm - 1 - months, 1));
    const pt = new Date(Date.UTC(fy, fm - 1, 0));
    return { from: `${pf.getUTCFullYear()}-${pad(pf.getUTCMonth() + 1)}-01`, to: ymd(pt) };
  }
  const fromD = new Date(`${p.from}T00:00:00Z`);
  const toD = new Date(`${p.to}T00:00:00Z`);
  const spanDays = Math.round((toD.getTime() - fromD.getTime()) / 86400000) + 1;
  const prevTo = new Date(fromD.getTime() - 86400000);
  const prevFrom = new Date(prevTo.getTime() - (spanDays - 1) * 86400000);
  return { from: ymd(prevFrom), to: ymd(prevTo) };
}

const MONTHS_NOM = ["styczeń", "luty", "marzec", "kwiecień", "maj", "czerwiec", "lipiec", "sierpień", "wrzesień", "październik", "listopad", "grudzień"];
const dmy = (d: string) => { const [y, m, day] = d.split("-"); return `${day}.${m}.${y}`; };

export function periodLabel(p: Period): string {
  const [fy, fm, fd] = p.from.split("-").map(Number);
  const [ty, tm, td] = p.to.split("-").map(Number);
  if (fd === 1 && p.from.slice(0, 7) === p.to.slice(0, 7) && td === lastDay(ty, tm)) return `${MONTHS_NOM[fm - 1]} ${fy}`;
  if (fy === ty && fm === 1 && fd === 1 && tm === 12 && td === 31) return `rok ${fy}`;
  return `${dmy(p.from)} – ${dmy(p.to)}`;
}

type PeriodContextValue = {
  period: Period;
  prev: Period;
  preset: PresetKey;
  label: string;
  prevLabel: string;
  setPreset: (p: PresetKey) => void;
  setCustom: (from: string, to: string) => void;
};

const PeriodContext = createContext<PeriodContextValue | null>(null);
const LS_KEY = "spendly_reports_period";

export function PeriodProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<{ preset: PresetKey; period: Period }>(() => {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) {
        const p = JSON.parse(raw) as { preset: PresetKey; period: Period };
        // Presety liczymy od dziś (żeby „ten miesiąc" był bieżący); custom bierzemy zapisany.
        if (p.preset && p.preset !== "custom") return { preset: p.preset, period: presetPeriod(p.preset) };
        if (p.preset === "custom" && p.period?.from && p.period?.to) return p;
      }
    } catch {}
    return { preset: "this-month", period: presetPeriod("this-month") };
  });

  const persist = (next: { preset: PresetKey; period: Period }) => {
    setState(next);
    try { localStorage.setItem(LS_KEY, JSON.stringify(next)); } catch {}
  };

  const setPreset = (preset: PresetKey) => {
    if (preset === "custom") { persist({ preset, period: state.period }); return; }
    persist({ preset, period: presetPeriod(preset) });
  };
  const setCustom = (from: string, to: string) => {
    const p = from <= to ? { from, to } : { from: to, to: from };
    persist({ preset: "custom", period: p });
  };

  const value = useMemo<PeriodContextValue>(() => ({
    period: state.period,
    prev: previousPeriod(state.period),
    preset: state.preset,
    label: periodLabel(state.period),
    prevLabel: periodLabel(previousPeriod(state.period)),
    setPreset,
    setCustom,
  }), [state]);

  return <PeriodContext.Provider value={value}>{children}</PeriodContext.Provider>;
}

export function usePeriod() {
  const ctx = useContext(PeriodContext);
  if (!ctx) throw new Error("usePeriod must be used within PeriodProvider");
  return ctx;
}
