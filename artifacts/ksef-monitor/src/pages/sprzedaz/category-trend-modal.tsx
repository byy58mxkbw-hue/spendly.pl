// „Jak kategorie dań sprzedają się w czasie" — rozkład „Sprzedaż wg kategorii"
// na stronie pokazuje tylko bieżący miesiąc; ten wykres dokłada oś czasu, żeby
// zobaczyć czy kategoria rośnie, czy to chwilowy wynik.
import { useEffect, useMemo, useState } from "react";
import { useClerk } from "@clerk/react";
import {
  Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { apiUrl } from "@/lib/api-base";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { formatPrice } from "@/lib/format";
import { cn } from "@/lib/utils";
import { CHART_COLORS } from "../reports/components";

const MONTH_NAMES = [
  "styczeń", "luty", "marzec", "kwiecień", "maj", "czerwiec",
  "lipiec", "sierpień", "wrzesień", "październik", "listopad", "grudzień",
];
const MONTH_SHORT = ["sty", "lut", "mar", "kwi", "maj", "cze", "lip", "sie", "wrz", "paź", "lis", "gru"];
const MONTHS = 12;

function monthShort(ym: string): string {
  const m = parseInt(ym.split("-")[1] ?? "", 10);
  return MONTH_SHORT[m - 1] ?? ym;
}
function monthLong(ym: string): string {
  const [y, mm] = ym.split("-");
  return `${MONTH_NAMES[parseInt(mm, 10) - 1] ?? mm} ${y}`;
}

type CategoryTrendResponse = { months: string[]; series: Array<{ label: string; isUncategorized?: boolean; data: number[] }> };

export function CategoryTrendModal({ onClose, initialHidden, filtersActive }: {
  onClose: () => void;
  /** Kategorie już odpięte na liście "Sprzedaż wg kategorii dania" — wykres
   * startuje z tymi samymi schowanymi, żeby user nie odpinał drugi raz. */
  initialHidden?: Set<string>;
  /** Strona ma aktywny filtr pojedynczej kategorii — ten wykres go NIE
   * respektuje (zawsze pokazuje wszystkie, poza initialHidden), stąd notka. */
  filtersActive?: boolean;
}) {
  const { session } = useClerk();
  const [data, setData] = useState<CategoryTrendResponse | null>(null);
  const [loading, setLoading] = useState(true);
  // Kategorie ręcznie odznaczone przez usera — wykres z 8+ kategoriami robi
  // się nieczytelny, więc pozwalamy schować te, które nie interesują (np.
  // jednorazowa "Sala weselna"). Startuje od `initialHidden` (zsynchronizowane
  // z listą na stronie), dalsze zmiany tutaj są lokalne dla tego wykresu.
  const [hidden, setHidden] = useState<Set<string>>(() => new Set(initialHidden));
  function toggleHidden(key: string) {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void (async () => {
      const token = await session?.getToken();
      const res = await fetch(apiUrl(`/api/sales/category-trend?months=${MONTHS}`), {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const json = res.ok ? ((await res.json()) as CategoryTrendResponse) : null;
      if (!cancelled) { setData(json); setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [session]);

  // „Niezakategoryzowane" zawsze na szarym, na końcu legendy — spójnie z resztą strony.
  const categories = useMemo(() => {
    if (!data) return [];
    const uncategorized = data.series.filter((s) => s.isUncategorized);
    const rest = data.series.filter((s) => !s.isUncategorized);
    return [...rest, ...uncategorized].map((s, i) => ({
      key: s.label,
      label: s.label,
      color: s.isUncategorized ? "hsl(var(--muted-foreground))" : CHART_COLORS[i % CHART_COLORS.length],
    }));
  }, [data]);

  const chartData = useMemo(() => {
    if (!data) return [];
    return data.months.map((m, mi) => {
      const row: Record<string, string | number> = { month: m, label: monthShort(m) };
      for (const s of data.series) row[s.label] = s.data[mi] ?? 0;
      return row;
    });
  }, [data]);

  const hasAnyData = chartData.some((row) => categories.some((c) => Number(row[c.key] ?? 0) > 0));

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-2xl max-h-[88vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="head-display text-lg">Kategorie dań w czasie</DialogTitle>
        </DialogHeader>
        {filtersActive && (
          <p className="text-xs text-muted-foreground -mt-2">
            Ten wykres zawsze pokazuje wszystkie kategorie (poza ręcznie schowanymi niżej), niezależnie od filtra na liście.
          </p>
        )}

        <div className="flex-1 overflow-y-auto min-h-0">
        {loading ? (
          <Skeleton className="h-64 w-full" />
        ) : !hasAnyData ? (
          <p className="py-12 text-center text-sm text-muted-foreground">
            Brak danych sprzedaży w ostatnich {MONTHS} miesiącach.
          </p>
        ) : (
          <>
            <div className="overflow-x-auto -mx-1 px-1">
              <div className="min-w-[480px]">
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={chartData} margin={{ top: 4, right: 4, left: -8, bottom: 0 }} barCategoryGap="22%">
                    <CartesianGrid stroke="hsl(var(--border))" vertical={false} />
                    <XAxis
                      dataKey="label"
                      tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                      tickLine={false}
                      axisLine={{ stroke: "hsl(var(--border))" }}
                    />
                    <YAxis
                      tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                      tickLine={false}
                      axisLine={false}
                      width={52}
                      tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}k`}
                    />
                    <Tooltip
                      labelFormatter={(_, payload) => (payload?.[0]?.payload?.month ? monthLong(payload[0].payload.month as string) : "")}
                      formatter={(v: number, name: string) => [formatPrice(v), name]}
                      contentStyle={{
                        background: "hsl(var(--card))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: "4px",
                        fontSize: "12px",
                      }}
                    />
                    {categories.filter((c) => !hidden.has(c.key)).map((c) => (
                      <Bar key={c.key} dataKey={c.key} stackId="a" fill={c.color} name={c.label} isAnimationActive={false} />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground sm:hidden -mt-1">Przewiń wykres w bok, by zobaczyć więcej miesięcy.</p>
            <div className="flex items-center justify-between gap-2 mt-2">
              <div className="flex flex-wrap gap-x-1 gap-y-1">
                {categories.map((c) => {
                  const isHidden = hidden.has(c.key);
                  return (
                    <button
                      key={c.key}
                      type="button"
                      onClick={() => toggleHidden(c.key)}
                      aria-pressed={!isHidden}
                      title={isHidden ? `Pokaż „${c.label}"` : `Schowaj „${c.label}"`}
                      className={cn(
                        "flex items-center gap-1.5 text-[11px] transition-opacity max-w-[160px] px-1.5 py-1.5 -my-1.5",
                        isHidden ? "opacity-40 line-through" : "opacity-100",
                      )}
                    >
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ background: c.color }} />
                      <span className="truncate">{c.label}</span>
                    </button>
                  );
                })}
              </div>
              {hidden.size > 0 && (
                <button
                  type="button"
                  onClick={() => setHidden(new Set())}
                  className="shrink-0 text-[11px] text-muted-foreground hover:text-foreground transition-colors underline"
                >
                  Pokaż wszystkie
                </button>
              )}
            </div>
          </>
        )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
