// „Jak kategorie dań sprzedają się w czasie" — rozkład „Sprzedaż wg kategorii"
// na stronie pokazuje tylko bieżący miesiąc; ten wykres dokłada oś czasu, żeby
// zobaczyć czy kategoria rośnie, czy to chwilowy wynik.
import { useEffect, useMemo, useState } from "react";
import { useClerk } from "@clerk/react";
import {
  Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { apiUrl } from "@/lib/api-base";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { formatPrice } from "@/lib/format";
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

type CategoryTrendResponse = { months: string[]; series: Array<{ label: string; data: number[] }> };

export function CategoryTrendModal({ onClose }: { onClose: () => void }) {
  const { session } = useClerk();
  const [data, setData] = useState<CategoryTrendResponse | null>(null);
  const [loading, setLoading] = useState(true);

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
    const uncategorized = data.series.filter((s) => s.label === "Niezakategoryzowane");
    const rest = data.series.filter((s) => s.label !== "Niezakategoryzowane");
    return [...rest, ...uncategorized].map((s, i) => ({
      key: s.label,
      label: s.label,
      color: s.label === "Niezakategoryzowane" ? "hsl(var(--muted-foreground))" : CHART_COLORS[i % CHART_COLORS.length],
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
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="head-display text-lg">Kategorie dań w czasie</DialogTitle>
        </DialogHeader>

        {loading ? (
          <Skeleton className="h-64 w-full" />
        ) : !hasAnyData ? (
          <p className="py-12 text-center text-sm text-muted-foreground">
            Brak danych sprzedaży w ostatnich {MONTHS} miesiącach.
          </p>
        ) : (
          <div className="overflow-x-auto">
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
                  <Legend iconSize={8} iconType="circle" wrapperStyle={{ fontSize: 11, paddingTop: 10 }} />
                  {categories.map((c) => (
                    <Bar key={c.key} dataKey={c.key} stackId="a" fill={c.color} name={c.label} isAnimationActive={false} />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
