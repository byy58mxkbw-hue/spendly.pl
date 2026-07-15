// Model okresu raportów: [from, to] (YYYY-MM-DD, włącznie) + poprzedni RÓWNY okres.
// Zastępuje dawne „miesiąc + poprzedni miesiąc" — pojedynczy miesiąc to szczególny
// przypadek zakresu (from=1. dnia, to=ostatni dzień), więc porównanie zostaje jak dawniej.

export type Period = { from: string; to: string };

const pad = (n: number) => String(n).padStart(2, "0");
const ymdUTC = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
// Ostatni dzień miesiąca; m1 = 1..12.
const lastDayOfMonth = (y: number, m1: number) => new Date(Date.UTC(y, m1, 0)).getUTCDate();

const isYmd = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
const isMonth = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}$/.test(v);

// Wyznacza okres z query: preferuje from/to; w braku — month (cały miesiąc);
// w braku — bieżący miesiąc kalendarzowy. Zawsze zwraca poprawny [from<=to].
export function periodFromQuery(q: { from?: unknown; to?: unknown; month?: unknown }): Period {
  if (isYmd(q.from) && isYmd(q.to)) {
    return q.from <= q.to ? { from: q.from, to: q.to } : { from: q.to, to: q.from };
  }
  const now = new Date();
  const month = isMonth(q.month) ? q.month : `${now.getFullYear()}-${pad(now.getMonth() + 1)}`;
  const [y, m] = month.split("-").map(Number);
  return { from: `${month}-01`, to: `${month}-${pad(lastDayOfMonth(y, m))}` };
}

const isFirstOfMonth = (d: string) => d.slice(8, 10) === "01";
const isLastOfMonth = (d: string) => {
  const [y, m, day] = d.split("-").map(Number);
  return day === lastDayOfMonth(y, m);
};

// Poprzedni RÓWNY okres. Dla okresów równych pełnym miesiącom (wszystkie presety:
// miesiąc, kwartał, rok) przesuwa o liczbę miesięcy w zakresie (lipiec→czerwiec,
// 2026→2025, Q3→Q2). Dla dowolnego zakresu dni — przesuwa o długość zakresu w dniach.
export function previousPeriod(p: Period): Period {
  if (isFirstOfMonth(p.from) && isLastOfMonth(p.to)) {
    const [fy, fm] = p.from.split("-").map(Number);
    const [ty, tm] = p.to.split("-").map(Number);
    const months = (ty - fy) * 12 + (tm - fm) + 1;
    const pf = new Date(Date.UTC(fy, fm - 1 - months, 1)); // pierwszy dzień okresu wstecz
    const pt = new Date(Date.UTC(fy, fm - 1, 0)); // ostatni dzień miesiąca przed `from`
    return { from: `${pf.getUTCFullYear()}-${pad(pf.getUTCMonth() + 1)}-01`, to: ymdUTC(pt) };
  }
  const fromD = new Date(`${p.from}T00:00:00Z`);
  const toD = new Date(`${p.to}T00:00:00Z`);
  const spanDays = Math.round((toD.getTime() - fromD.getTime()) / 86400000) + 1;
  const prevTo = new Date(fromD.getTime() - 86400000);
  const prevFrom = new Date(prevTo.getTime() - (spanDays - 1) * 86400000);
  return { from: ymdUTC(prevFrom), to: ymdUTC(prevTo) };
}

const MONTHS_NOM = [
  "styczeń", "luty", "marzec", "kwiecień", "maj", "czerwiec",
  "lipiec", "sierpień", "wrzesień", "październik", "listopad", "grudzień",
];

// Czytelna etykieta okresu (PL): pełny miesiąc → „lipiec 2026", pełny rok → „rok 2026",
// inaczej „2026-01-15 – 2026-03-20".
export function periodLabel(p: Period): string {
  const [fy, fm, fd] = p.from.split("-").map(Number);
  const [ty, tm, td] = p.to.split("-").map(Number);
  if (fd === 1 && p.from.slice(0, 7) === p.to.slice(0, 7) && td === lastDayOfMonth(ty, tm)) {
    return `${MONTHS_NOM[fm - 1]} ${fy}`;
  }
  if (fy === ty && fm === 1 && fd === 1 && tm === 12 && td === 31) return `rok ${fy}`;
  return `${p.from} – ${p.to}`;
}
