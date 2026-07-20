// Wykresy recharts z Raportów wydzielone do OSOBNEGO chunku (recharts ~110KB gzip),
// ładowanego leniwie z reports.tsx (React.lazy + Suspense). Dzięki temu strona Raportów
// (KPI, tabele, listy) renderuje się bez czekania na pobranie/parsowanie recharts.
// Ciała komponentów 1:1 z components.tsx — zero zmiany zachowania.
import { useMemo } from "react";
import {
  Cell,
  Tooltip,
  ResponsiveContainer,
  XAxis,
  YAxis,
  CartesianGrid,
  AreaChart,
  Area,
  BarChart,
  Bar,
  LabelList,
  Legend,
} from "recharts";
import { useGetCategorySpend, useGetCategorySpendTrend } from "@workspace/api-client-react";
import { useCostCenter } from "@/contexts/cost-center-context";
import { usePeriod } from "@/contexts/period-context";
import { Skeleton } from "@/components/ui/skeleton";
import { formatPrice } from "@/lib/format";
import { cn } from "@/lib/utils";
import { CATEGORIES } from "@/lib/categories";
import { CHART_COLORS, shortMonthLabel, useCategoryGroupData, CategoryComparisonTable } from "./components";

// ─── Spend trend chart ─────────────────────────────────────────────────────────

export function SpendTrendChart({ months: numMonths = 6 }: { months?: number }) {
  const { selectedId: costCenterId } = useCostCenter();
  const ccParam = costCenterId != null ? { costCenterId } : {};

  const { data: trendData, isLoading } = useGetCategorySpendTrend(
    { months: numMonths, ...ccParam },
    { query: { queryKey: ["category-spend-trend", numMonths, costCenterId] } },
  );

  const chartData = useMemo(() => {
    if (!trendData) return [];
    const byMonth = new Map<string, number>();
    for (const row of trendData) {
      byMonth.set(row.month, (byMonth.get(row.month) ?? 0) + row.totalSpend);
    }
    return Array.from(byMonth.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([month, total]) => ({ month: shortMonthLabel(month), total }));
  }, [trendData]);

  if (isLoading) return <Skeleton className="h-48 rounded-xl" />;

  return (
    <div className="overflow-x-auto">
     <div className="min-w-[420px]">
    <ResponsiveContainer width="100%" height={200}>
      <AreaChart data={chartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
        <defs>
          <linearGradient id="trendGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="hsl(173, 80%, 40%)" stopOpacity={0.25} />
            <stop offset="95%" stopColor="hsl(173, 80%, 40%)" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
        <XAxis
          dataKey="month"
          tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
          tickLine={false}
          axisLine={false}
        />
        <YAxis
          tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
          tickLine={false}
          axisLine={false}
          tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
        />
        <Tooltip
          contentStyle={{
            background: "hsl(var(--card))",
            border: "1px solid hsl(var(--border))",
            borderRadius: "8px",
            fontSize: "12px",
          }}
          formatter={(v: number) => [formatPrice(v), "Wydatki"]}
        />
        <Area
          type="monotone"
          dataKey="total"
          stroke="hsl(173, 80%, 40%)"
          strokeWidth={2}
          fill="url(#trendGrad)"
          dot={false}
          activeDot={{ r: 4, fill: "hsl(173, 80%, 40%)" }}
        />
      </AreaChart>
    </ResponsiveContainer>
     </div>
    </div>
  );
}

// ─── Category Bar Chart Tooltip ────────────────────────────────────────────────

function CategoryBarChartTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: any[];
}) {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload as any;
  return (
    <div className="bg-card border border-border rounded-lg px-3 py-2 text-xs shadow-sm min-w-[160px]">
      <p className="font-semibold mb-1.5 text-foreground">{d.label}</p>
      <p className="tabular-nums text-foreground font-bold text-sm">{formatPrice(d.spend)}</p>
      <p className="text-muted-foreground mt-0.5">{d.pct.toFixed(1)}% budżetu</p>
      {d.trend != null && (
        <p className={cn("mt-1 font-semibold", d.trend > 0 ? "text-red-500" : "text-emerald-600")}>
          {d.trend > 0 ? "+" : ""}{d.trend.toFixed(1)}% vs poprz. okres
        </p>
      )}
    </div>
  );
}

// ─── Category Bar Chart ────────────────────────────────────────────────────────

export function CategoryBarChart() {
  const { selectedId: costCenterId } = useCostCenter();
  const { period, prev, label } = usePeriod();
  const ccParam = costCenterId != null ? { costCenterId } : {};

  const { data: currentData, isLoading } = useGetCategorySpend(
    { from: period.from, to: period.to, ...ccParam },
    { query: { queryKey: ["category-spend", period.from, period.to, costCenterId] } },
  );
  const { data: prevData } = useGetCategorySpend(
    { from: prev.from, to: prev.to, ...ccParam },
    { query: { queryKey: ["category-spend", prev.from, prev.to, costCenterId] } },
  );

  const groups = useCategoryGroupData(currentData, prevData);

  const total = groups.reduce((s, g) => s + g.spend, 0);

  if (isLoading) return <Skeleton className="h-80 rounded-xl" />;
  if (!groups.length) return (
    <div className="glass rounded-xl py-16 text-center">
      <p className="text-sm text-muted-foreground">Brak danych kategorii za {label}</p>
    </div>
  );

  const barData = groups.map((g, i) => ({
    ...g,
    fill: CHART_COLORS[i % CHART_COLORS.length],
    pct: total > 0 ? (g.spend / total) * 100 : 0,
  }));

  const barHeight = Math.max(260, groups.length * 44);

  return (
    <div className="glass rounded-xl overflow-hidden">
      {/* Summary header */}
      <div className="px-5 py-4 border-b border-border flex flex-wrap items-center gap-x-8 gap-y-2">
        <div>
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">Łączne wydatki</p>
          <p className="text-2xl font-bold tabular-nums text-foreground">{formatPrice(total)}</p>
        </div>
        <div>
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">Kategorii</p>
          <p className="text-2xl font-bold text-foreground">{groups.length}</p>
        </div>
        {groups[0] && (
          <div>
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-0.5">Największa</p>
            <p className="text-sm font-semibold text-foreground">
              {groups[0].label}
              <span className="text-muted-foreground font-normal ml-1.5">
                {(total > 0 ? (groups[0].spend / total) * 100 : 0).toFixed(0)}% budżetu
              </span>
            </p>
          </div>
        )}
      </div>

      {/* Horizontal bar chart */}
      <div className="px-4 pt-5 pb-2">
        <ResponsiveContainer width="100%" height={barHeight}>
          <BarChart
            layout="vertical"
            data={barData}
            margin={{ top: 0, right: 130, left: 4, bottom: 0 }}
            barCategoryGap="28%"
          >
            <XAxis
              type="number"
              tickFormatter={(v: number) => v === 0 ? "0" : `${(v / 1000).toFixed(0)}k`}
              tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              type="category"
              dataKey="shortLabel"
              width={118}
              tick={{ fontSize: 11, fill: "hsl(var(--foreground))" }}
              tickLine={false}
              axisLine={false}
            />
            <Tooltip content={CategoryBarChartTooltip} />
            <Bar dataKey="spend" radius={[0, 4, 4, 0]}>
              {barData.map((entry) => (
                <Cell key={entry.id} fill={entry.fill} />
              ))}
              <LabelList
                dataKey="spend"
                position="right"
                formatter={(v: number) => formatPrice(v)}
                style={{ fontSize: 11, fontWeight: 600, fill: "hsl(var(--foreground))" }}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <CategoryComparisonTable groups={groups} total={total} />
    </div>
  );
}

// ─── CategoryTrendChart — stacked bar chart by category over months ────────────

export function CategoryTrendChart({ months: numMonths = 6 }: { months?: number }) {
  const { selectedId: costCenterId } = useCostCenter();
  const ccParam = costCenterId != null ? { costCenterId } : {};

  const { data: trendData, isLoading } = useGetCategorySpendTrend(
    { months: numMonths, ...ccParam },
    { query: { queryKey: ["category-spend-trend", numMonths, costCenterId] } },
  );

  const { chartData, categories } = useMemo(() => {
    if (!trendData || !trendData.length) return { chartData: [], categories: [] };

    const catSet = new Set<string>();
    const monthSet = new Set<string>();
    for (const row of trendData) {
      catSet.add(row.category ?? "inne");
      monthSet.add(row.month);
    }

    const sortedMonths = Array.from(monthSet).sort();

    const byMonth = new Map<string, Record<string, number>>();
    for (const m of sortedMonths) byMonth.set(m, {});
    for (const row of trendData) {
      const cat = row.category ?? "inne";
      const obj = byMonth.get(row.month)!;
      obj[cat] = (obj[cat] ?? 0) + row.totalSpend;
    }

    const catTotals = Array.from(catSet).map((cat) => ({
      cat,
      total: Array.from(byMonth.values()).reduce((s, m) => s + (m[cat] ?? 0), 0),
    }));
    catTotals.sort((a, b) => b.total - a.total);
    const topCats = catTotals.slice(0, 8);

    const chartData = sortedMonths.map((m) => {
      const obj = byMonth.get(m) ?? {};
      const row: Record<string, string | number> = { month: shortMonthLabel(m) };
      for (const { cat } of topCats) row[cat] = obj[cat] ?? 0;
      return row;
    });

    const categories = topCats.map(({ cat }, i) => {
      const catDef = CATEGORIES.find((c) => c.id === cat);
      return {
        id: cat,
        label: (catDef?.label ?? "Inne").split(" / ")[0],
        color: CHART_COLORS[i % CHART_COLORS.length],
      };
    });

    return { chartData, categories };
  }, [trendData]);

  if (isLoading) return <Skeleton className="h-56 w-full" />;
  if (!chartData.length) return (
    <div className="py-10 text-center text-sm text-muted-foreground">Brak danych trendu</div>
  );

  return (
    <div className="overflow-x-auto">
     <div className="min-w-[480px]">
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={chartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }} barCategoryGap="30%">
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
        <XAxis
          dataKey="month"
          tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
          tickLine={false}
          axisLine={false}
        />
        <YAxis
          tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
          tickLine={false}
          axisLine={false}
          tickFormatter={(v: number) => `${(v / 1000).toFixed(0)}k`}
        />
        <Tooltip
          contentStyle={{
            background: "hsl(var(--card))",
            border: "1px solid hsl(var(--border))",
            borderRadius: "8px",
            fontSize: "12px",
          }}
          formatter={(v: number, name: string) => {
            const catDef = CATEGORIES.find((c) => c.id === name);
            return [formatPrice(v), (catDef?.label ?? name).split(" / ")[0]];
          }}
        />
        <Legend
          iconSize={8}
          iconType="circle"
          wrapperStyle={{ fontSize: 11, paddingTop: 10 }}
          formatter={(name: string) => {
            const catDef = CATEGORIES.find((c) => c.id === name);
            return (catDef?.label ?? name).split(" / ")[0];
          }}
        />
        {categories.map((cat) => (
          <Bar key={cat.id} dataKey={cat.id} stackId="a" fill={cat.color} name={cat.id} />
        ))}
      </BarChart>
    </ResponsiveContainer>
     </div>
    </div>
  );
}
