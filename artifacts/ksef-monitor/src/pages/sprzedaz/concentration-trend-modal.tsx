// Trend koncentracji sprzedaży (% obrotu z TOP10 pozycji) w czasie — karta
// "Koncentracja" na stronie pokazuje tylko bieżący miesiąc; ten wykres dokłada
// oś czasu, żeby zobaczyć czy restauracja robi się coraz bardziej zależna od
// wąskiej oferty, czy się dywersyfikuje.
import { useEffect, useMemo, useState } from "react";
import { useClerk } from "@clerk/react";
import { CartesianGrid, Line, LineChart as RLineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { apiUrl } from "@/lib/api-base";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";

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

type ConcentrationTrendResponse = { months: string[]; pct: (number | null)[] };

export function ConcentrationTrendModal({ onClose }: { onClose: () => void }) {
  const { session } = useClerk();
  const [data, setData] = useState<ConcentrationTrendResponse | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void (async () => {
      const token = await session?.getToken();
      const res = await fetch(apiUrl(`/api/sales/concentration-trend?months=${MONTHS}`), {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const json = res.ok ? ((await res.json()) as ConcentrationTrendResponse) : null;
      if (!cancelled) { setData(json); setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [session]);

  const chartData = useMemo(() => {
    if (!data) return [];
    return data.months.map((m, i) => ({ month: m, label: monthShort(m), pct: data.pct[i] }));
  }, [data]);

  const hasAnyData = chartData.some((row) => row.pct != null);

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="head-display text-lg">Koncentracja sprzedaży w czasie</DialogTitle>
        </DialogHeader>
        <p className="text-xs text-muted-foreground -mt-2">Jaki % obrotu robi TOP 10 pozycji, miesiąc po miesiącu.</p>

        {loading ? (
          <Skeleton className="h-64 w-full" />
        ) : !hasAnyData ? (
          <p className="py-12 text-center text-sm text-muted-foreground">
            Brak danych sprzedaży w ostatnich {MONTHS} miesiącach.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <div className="min-w-[420px]">
              <ResponsiveContainer width="100%" height={260}>
                <RLineChart data={chartData} margin={{ top: 4, right: 12, left: -8, bottom: 0 }}>
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
                    width={36}
                    domain={[0, 100]}
                    tickFormatter={(v: number) => `${v}%`}
                  />
                  <Tooltip
                    labelFormatter={(_, payload) => (payload?.[0]?.payload?.month ? monthLong(payload[0].payload.month as string) : "")}
                    formatter={(v) => [typeof v === "number" ? `${v.toFixed(1)}%` : "brak danych", "TOP 10"]}
                    contentStyle={{
                      background: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "4px",
                      fontSize: "12px",
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="pct"
                    stroke="hsl(var(--chart-1))"
                    strokeWidth={2}
                    dot={{ r: 3 }}
                    connectNulls
                    isAnimationActive={false}
                  />
                </RLineChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
