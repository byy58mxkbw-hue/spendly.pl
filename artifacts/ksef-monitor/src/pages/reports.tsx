import { useState, useMemo, useEffect } from "react";
import { Layout, PageHeader } from "@/components/layout";
import {
  useGetMonthlyReport,
  useGetCategorySpend,
  useGetCategorySpendTrend,
  useGetDashboardActiveAlerts,
  useGetReportsCostCenters,
  useGetSpendBridge,
} from "@workspace/api-client-react";
import type { ReportProductRow, ReportSupplierRow, SpendBridge } from "@workspace/api-client-react";
import { useCostCenter } from "@/contexts/cost-center-context";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
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
import {
  ChevronLeft,
  ChevronRight,
  ArrowUp,
  ArrowDown,
  AlertTriangle,
  CheckCircle2,
  Sparkles,
  ShoppingCart,
  FileText,
  Package,
  Bell,
  TrendingUp,
  BarChart3,
  Users,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Layers,
  Download,
} from "lucide-react";
import { formatPrice } from "@/lib/format";
import { cn } from "@/lib/utils";
import { CATEGORIES } from "@/lib/categories";
import { Link, useLocation } from "wouter";
import { exportToCsv, todaySlug } from "@/lib/export-csv";

// ─── Month helpers ─────────────────────────────────────────────────────────────

function monthLabel(month: string) {
  const [year, m] = month.split("-");
  const names = [
    "Styczeń","Luty","Marzec","Kwiecień","Maj","Czerwiec",
    "Lipiec","Sierpień","Wrzesień","Październik","Listopad","Grudzień",
  ];
  return `${names[parseInt(m) - 1]} ${year}`;
}
function shortMonthLabel(month: string) {
  const [, m] = month.split("-");
  const names = ["Sty","Lut","Mar","Kwi","Maj","Cze","Lip","Sie","Wrz","Paź","Lis","Gru"];
  return names[parseInt(m) - 1];
}
function prevMonth(month: string) {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, m - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function nextMonth(month: string) {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(y, m, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function currentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

// ─── Colors ───────────────────────────────────────────────────────────────────

const CHART_COLORS = [
  "hsl(173, 80%, 40%)",
  "hsl(200, 70%, 50%)",
  "hsl(220, 60%, 55%)",
  "hsl(250, 60%, 60%)",
  "hsl(280, 55%, 55%)",
  "hsl(30,  75%, 50%)",
  "hsl(50,  80%, 45%)",
  "hsl(340, 65%, 52%)",
  "hsl(160, 60%, 42%)",
  "hsl(10,  70%, 52%)",
  "hsl(195, 65%, 48%)",
  "hsl(265, 60%, 58%)",
  "hsl(95,  55%, 42%)",
  "hsl(315, 55%, 50%)",
];

// ─── Computed product impact ───────────────────────────────────────────────────

type ProductWithImpact = ReportProductRow & {
  supplierName?: string | null;
  priceImpact: number;
  pricePct: number;
  qtyPct: number;
};

function computeImpacts(products: ReportProductRow[]): ProductWithImpact[] {
  return products.map((p) => {
    const priceDelta =
      p.prevMonthAvgPrice != null && p.prevMonthAvgPrice > 0
        ? p.avgPrice - p.prevMonthAvgPrice
        : 0;
    const priceImpact = priceDelta * p.totalQuantity;
    const pricePct =
      p.prevMonthAvgPrice != null && p.prevMonthAvgPrice > 0
        ? ((p.avgPrice - p.prevMonthAvgPrice) / p.prevMonthAvgPrice) * 100
        : 0;
    const qtyPct =
      p.prevMonthTotalQuantity != null && p.prevMonthTotalQuantity > 0
        ? ((p.totalQuantity - p.prevMonthTotalQuantity) / p.prevMonthTotalQuantity) * 100
        : 0;
    return { ...p, priceImpact, pricePct, qtyPct };
  });
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────

function KpiCard({
  label,
  value,
  sub,
  subColor,
  icon: Icon,
  iconBg,
}: {
  label: string;
  value: string;
  sub?: string;
  subColor?: "red" | "green" | "muted";
  icon: React.ElementType;
  iconBg?: string;
}) {
  return (
    <div className="bg-card border border-border rounded-xl p-4 md:p-5 flex items-start gap-3 md:gap-4">
      <div
        className={cn(
          "w-10 h-10 rounded-lg flex items-center justify-center shrink-0",
          iconBg ?? "bg-primary/10 text-primary",
        )}
      >
        <Icon className="w-5 h-5" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs text-muted-foreground mb-0.5 truncate">{label}</p>
        <p className="text-xl font-bold text-foreground leading-tight">{value}</p>
        {sub && (
          <p
            className={cn(
              "text-xs mt-0.5 truncate font-medium",
              subColor === "red" && "text-red-500",
              subColor === "green" && "text-emerald-600",
              (!subColor || subColor === "muted") && "text-muted-foreground",
            )}
          >
            {sub}
          </p>
        )}
      </div>
    </div>
  );
}

// ─── AI Summary block ──────────────────────────────────────────────────────────

function AiSummaryBlock({
  totalSpend,
  prevSpend,
  topImpact,
  momPct,
}: {
  totalSpend: number;
  prevSpend: number;
  topImpact: ProductWithImpact[];
  momPct: number;
}) {
  const diff = totalSpend - prevSpend;
  const isUp = diff > 0;

  const drivers = topImpact
    .slice(0, 3)
    .filter((p) => p.priceImpact !== 0)
    .map((p) => `${p.productName} (${p.priceImpact > 0 ? "+" : ""}${formatPrice(p.priceImpact)})`)
    .join(", ");

  const mainSentence =
    prevSpend > 0
      ? `Wydałeś ${isUp ? "o " + formatPrice(Math.abs(diff)) + " więcej" : "o " + formatPrice(Math.abs(diff)) + " mniej"} niż w poprzednim miesiącu (${isUp ? "+" : ""}${momPct.toFixed(1)}%).${drivers ? ` Główne przyczyny: ${drivers}.` : ""}`
      : `Łączne zakupy w tym miesiącu: ${formatPrice(totalSpend)}.`;

  const savingsDriver = topImpact.find((p) => p.priceImpact > 200);
  const secondSentence = savingsDriver
    ? ` Możesz odzyskać ~${formatPrice(savingsDriver.priceImpact)} negocjując cenę ${savingsDriver.productName} u dostawcy.`
    : "";

  return (
    <div className="bg-card border border-border rounded-xl p-4 md:p-5 mb-5 md:mb-6">
      <div className="flex items-start gap-3">
        <div className="w-8 h-8 rounded-lg bg-violet-500/10 text-violet-600 flex items-center justify-center shrink-0 mt-0.5">
          <Sparkles className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">
            Podsumowanie AI
          </p>
          <p className="text-sm text-foreground leading-relaxed">
            {mainSentence}
            {secondSentence}
          </p>
        </div>
        <Button size="sm" variant="outline" className="shrink-0 hidden md:flex gap-1.5 text-xs">
          Zobacz szczegóły
          <ExternalLink className="w-3 h-3" />
        </Button>
      </div>
    </div>
  );
}

// ─── Price Impact list ─────────────────────────────────────────────────────────

function PriceImpactList({
  products,
  onViewAll,
}: {
  products: ProductWithImpact[];
  onViewAll?: () => void;
}) {
  const top = products
    .filter((p) => p.priceImpact !== 0)
    .sort((a, b) => Math.abs(b.priceImpact) - Math.abs(a.priceImpact))
    .slice(0, 5);

  if (top.length === 0)
    return (
      <div className="text-center py-8 text-muted-foreground text-sm">
        Brak danych porównawczych
      </div>
    );

  return (
    <div className="divide-y divide-border">
      {top.map((p, i) => {
        const up = p.priceImpact > 0;
        return (
          <div key={i} className="flex items-start gap-3 py-3 px-4 md:px-5">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground leading-snug line-clamp-2">
                {p.productName}
              </p>
              {p.supplierName && (
                <p className="text-[10px] text-muted-foreground mt-0.5 truncate">{p.supplierName}</p>
              )}
            </div>
            <span
              className={cn(
                "text-sm font-bold tabular-nums shrink-0 mt-0.5",
                up ? "text-red-500" : "text-emerald-600",
              )}
            >
              {up ? "+" : ""}
              {formatPrice(p.priceImpact)}
            </span>
          </div>
        );
      })}
      <div className="px-4 md:px-5 pt-3 pb-2">
        <button
          onClick={onViewAll}
          className="w-full text-xs text-primary font-medium hover:underline text-center"
        >
          Zobacz pełny raport
        </button>
      </div>
    </div>
  );
}

// ─── Quantity Impact table ─────────────────────────────────────────────────────

function QuantityImpactTable({
  products,
  onViewAll,
}: {
  products: ProductWithImpact[];
  onViewAll?: () => void;
}) {
  const top = products
    .filter(
      (p) =>
        p.prevMonthTotalQuantity != null &&
        p.prevMonthTotalQuantity > 0 &&
        Math.abs(p.qtyPct) > 0,
    )
    .sort((a, b) => Math.abs(b.qtyPct) - Math.abs(a.qtyPct))
    .slice(0, 5);

  if (top.length === 0)
    return (
      <div className="text-center py-8 text-muted-foreground text-sm">
        Brak danych porównawczych
      </div>
    );

  return (
    <div>
      <div className="grid grid-cols-[1fr_auto] gap-2 px-4 md:px-5 py-2 bg-secondary/30 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
        <div>Produkt</div>
        <div className="text-right w-16">Zmiana</div>
      </div>
      <div className="divide-y divide-border">
        {top.map((p, i) => {
          const up = p.qtyPct > 0;
          const prevQty = p.prevMonthTotalQuantity ?? 0;
          const fmtQty = (q: number) =>
            (q % 1 === 0 ? q.toFixed(0) : q.toFixed(1)) + " " + p.unit;
          return (
            <div
              key={i}
              className="grid grid-cols-[1fr_auto] gap-2 px-4 md:px-5 py-2.5 items-center"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground leading-snug line-clamp-2">{p.productName}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5 tabular-nums">
                  {fmtQty(prevQty)} → {fmtQty(p.totalQuantity)}
                </p>
              </div>
              <span
                className={cn(
                  "text-sm font-bold text-right w-16 tabular-nums flex items-center justify-end gap-0.5 shrink-0",
                  up ? "text-red-500" : "text-emerald-600",
                )}
              >
                {up ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />}
                {Math.abs(p.qtyPct).toFixed(0)}%
              </span>
            </div>
          );
        })}
      </div>
      <div className="px-4 md:px-5 pt-3 pb-2">
        <button
          onClick={onViewAll}
          className="w-full text-xs text-primary font-medium hover:underline text-center"
        >
          Zobacz pełny raport
        </button>
      </div>
    </div>
  );
}

// ─── Price Changes table ───────────────────────────────────────────────────────

function PriceChangesTable({
  products,
  onViewAll,
}: {
  products: ProductWithImpact[];
  onViewAll?: () => void;
}) {
  const top = products
    .filter((p) => p.prevMonthAvgPrice != null && p.prevMonthAvgPrice > 0 && p.pricePct !== 0)
    .sort((a, b) => Math.abs(b.pricePct) - Math.abs(a.pricePct))
    .slice(0, 5);

  if (top.length === 0)
    return (
      <div className="text-center py-8 text-muted-foreground text-sm">
        Brak danych porównawczych
      </div>
    );

  return (
    <div>
      <div className="grid grid-cols-[1fr_auto] gap-2 px-4 md:px-5 py-2 bg-secondary/30 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
        <div>Produkt</div>
        <div className="text-right w-16">Zmiana</div>
      </div>
      <div className="divide-y divide-border">
        {top.map((p, i) => {
          const up = p.pricePct > 0;
          return (
            <div
              key={i}
              className="grid grid-cols-[1fr_auto] gap-2 px-4 md:px-5 py-2.5 items-center"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground leading-snug line-clamp-2">{p.productName}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5 tabular-nums">
                  {formatPrice(p.prevMonthAvgPrice ?? 0)} → {formatPrice(p.avgPrice)}/{p.unit}
                </p>
              </div>
              <span
                className={cn(
                  "text-sm font-bold text-right w-16 tabular-nums flex items-center justify-end gap-0.5 shrink-0",
                  up ? "text-red-500" : "text-emerald-600",
                )}
              >
                {up ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />}
                {Math.abs(p.pricePct).toFixed(1)}%
              </span>
            </div>
          );
        })}
      </div>
      <div className="px-4 md:px-5 pt-3 pb-2">
        <button
          onClick={onViewAll}
          className="w-full text-xs text-primary font-medium hover:underline text-center"
        >
          Zobacz pełny raport
        </button>
      </div>
    </div>
  );
}

// ─── Spend trend chart ─────────────────────────────────────────────────────────

function SpendTrendChart({ months: numMonths = 6 }: { months?: number }) {
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

// ─── Category mini list (for Podsumowanie sidebar card) ───────────────────────

function CategoryMiniList({ month }: { month: string }) {
  const { selectedId: costCenterId } = useCostCenter();
  const ccParam = costCenterId != null ? { costCenterId } : {};

  const { data, isLoading } = useGetCategorySpend(
    { month, ...ccParam },
    { query: { queryKey: ["category-spend", month, costCenterId] } },
  );

  const groups = useMemo(() => {
    if (!data) return [];
    const map = new Map<string, number>();
    for (const item of data) {
      const cat = item.category ?? "inne";
      map.set(cat, (map.get(cat) ?? 0) + item.totalSpend);
    }
    return Array.from(map.entries())
      .map(([id, spend]) => {
        const catDef = CATEGORIES.find((c) => c.id === id);
        return { id, label: catDef?.label ?? "Inne", spend };
      })
      .sort((a, b) => b.spend - a.spend)
      .slice(0, 7);
  }, [data]);

  const total = groups.reduce((s, g) => s + g.spend, 0);

  if (isLoading) return <Skeleton className="h-40 w-full" />;
  if (!groups.length) return (
    <div className="py-6 text-center text-sm text-muted-foreground">Brak danych</div>
  );

  return (
    <div className="space-y-3">
      {groups.map((g, i) => {
        const pct = total > 0 ? (g.spend / total) * 100 : 0;
        const color = CHART_COLORS[i % CHART_COLORS.length];
        return (
          <div key={g.id}>
            <div className="flex items-center justify-between gap-2 mb-1">
              <div className="flex items-center gap-1.5 min-w-0">
                <div className="w-2 h-2 rounded-full shrink-0" style={{ background: color }} />
                <span className="text-xs text-foreground truncate">{g.label}</span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-[11px] text-muted-foreground tabular-nums">{pct.toFixed(0)}%</span>
                <span className="text-xs font-semibold tabular-nums">{formatPrice(g.spend)}</span>
              </div>
            </div>
            <div className="h-1 bg-secondary rounded-full overflow-hidden">
              <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: color }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Top suppliers table ───────────────────────────────────────────────────────

function TopSuppliersTable({
  suppliers,
  totalSpend,
  onViewAll,
}: {
  suppliers: ReportSupplierRow[];
  totalSpend: number;
  onViewAll?: () => void;
}) {
  const sorted = [...suppliers].sort((a, b) => b.totalSpend - a.totalSpend).slice(0, 5);

  if (!sorted.length)
    return (
      <div className="text-center py-8 text-muted-foreground text-sm">Brak dostawców</div>
    );

  return (
    <div>
      <div className="grid grid-cols-[1fr_auto_auto] gap-2 px-4 md:px-5 py-2 bg-secondary/30 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
        <div>Dostawca</div>
        <div className="text-right w-24">Wydatki</div>
        <div className="text-right w-12">Udział</div>
      </div>
      <div className="divide-y divide-border">
        {sorted.map((s, i) => {
          const pct = totalSpend > 0 ? (s.totalSpend / totalSpend) * 100 : 0;
          const prods = s.topProducts.filter(
            (p) => p.prevMonthAvgPrice != null && p.prevMonthAvgPrice > 0,
          );
          const avgPriceChange =
            prods.length > 0
              ? prods.reduce(
                  (sum, p) =>
                    sum +
                    ((p.avgPrice - (p.prevMonthAvgPrice ?? p.avgPrice)) /
                      (p.prevMonthAvgPrice ?? p.avgPrice)) *
                      100,
                  0,
                ) / prods.length
              : null;

          return (
            <div
              key={s.supplierId}
              className="grid grid-cols-[1fr_auto_auto] gap-2 px-4 md:px-5 py-2.5 items-center"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground leading-snug line-clamp-2">{s.supplierName}</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  {s.invoiceCount} {s.invoiceCount === 1 ? "faktura" : "faktur"}
                  {avgPriceChange !== null && (
                    <span className={cn("ml-2 font-semibold", avgPriceChange > 0 ? "text-red-500" : "text-emerald-600")}>
                      {avgPriceChange > 0 ? "+" : ""}{avgPriceChange.toFixed(1)}%
                    </span>
                  )}
                </p>
              </div>
              <p className="text-sm font-semibold text-right w-24 tabular-nums shrink-0">
                {formatPrice(s.totalSpend)}
              </p>
              <p className="text-xs text-muted-foreground text-right w-12 tabular-nums shrink-0">
                {pct.toFixed(1)}%
              </p>
            </div>
          );
        })}
      </div>
      <div className="px-4 md:px-5 pt-3 pb-2">
        <button
          onClick={onViewAll}
          className="w-full text-xs text-primary font-medium hover:underline text-center"
        >
          Zobacz pełny raport
        </button>
      </div>
    </div>
  );
}

// ─── Critical alerts list ──────────────────────────────────────────────────────

function AlertsList({ onViewAll }: { onViewAll?: () => void }) {
  const { data: alerts, isLoading } = useGetDashboardActiveAlerts({
    query: { queryKey: ["dashboard-active-alerts"] },
  });

  if (isLoading) return <Skeleton className="h-24 rounded-xl" />;

  const top = (alerts ?? []).slice(0, 4);

  if (!top.length)
    return (
      <div className="py-6 text-center text-sm text-muted-foreground">
        Brak aktywnych alertów
      </div>
    );

  return (
    <div className="divide-y divide-border">
      {top.map((alert) => {
        const timeAgo = (() => {
          const diff = Date.now() - new Date(alert.alertDate).getTime();
          const days = Math.floor(diff / 86400000);
          if (days === 0) return "Dzisiaj";
          if (days === 1) return "Wczoraj";
          return `${days} dni temu`;
        })();

        return (
          <div key={alert.alertId} className="flex items-start gap-3 px-4 md:px-5 py-3">
            <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-sm text-foreground leading-snug">
                Cena{" "}
                <span className="font-medium">{alert.productName}</span>{" "}
                wzrosła o{" "}
                <span className="font-semibold text-red-500">
                  +{alert.changePercent.toFixed(1)}%
                </span>
                {alert.supplierName ? ` u dostawcy ${alert.supplierName}` : ""}
              </p>
            </div>
            <span className="text-[10px] text-muted-foreground shrink-0">{timeAgo}</span>
          </div>
        );
      })}
      <div className="px-4 md:px-5 pt-3 pb-2">
        <button
          onClick={onViewAll}
          className="w-full text-xs text-primary font-medium hover:underline text-center"
        >
          Zobacz wszystkie alerty
        </button>
      </div>
    </div>
  );
}

// ─── Recommendations ───────────────────────────────────────────────────────────

function RecommendationsList({ products }: { products: ProductWithImpact[] }) {
  const recs = useMemo(() => {
    const items: { text: string }[] = [];

    const topPrice = [...products]
      .filter((p) => p.priceImpact > 0)
      .sort((a, b) => b.priceImpact - a.priceImpact)
      .slice(0, 2);

    for (const p of topPrice) {
      items.push({
        text: `Negocjuj cenę ${p.productName} – potencjalna oszczędność ${formatPrice(p.priceImpact)} miesięcznie`,
      });
    }

    const topQty = [...products]
      .filter((p) => p.qtyPct > 40 && (p.prevMonthTotalQuantity ?? 0) > 0)
      .sort((a, b) => b.qtyPct - a.qtyPct)
      .slice(0, 1);

    for (const p of topQty) {
      items.push({
        text: `Zmniejsz zakupy ${p.productName} – zakupiono ${p.qtyPct.toFixed(0)}% więcej niż miesiąc temu`,
      });
    }

    if (items.length === 0) {
      items.push({ text: "Brak anomalii cenowych w tym miesiącu – utrzymaj obecną strategię zakupów." });
    }

    return items.slice(0, 4);
  }, [products]);

  return (
    <div className="divide-y divide-border">
      {recs.map((r, i) => (
        <div key={i} className="flex items-start gap-3 px-4 md:px-5 py-3">
          <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
          <p className="text-sm text-foreground leading-snug">{r.text}</p>
        </div>
      ))}
      <div className="px-4 md:px-5 pt-3 pb-2">
        <button className="w-full text-xs text-primary font-medium hover:underline text-center">
          Zobacz wszystkie rekomendacje
        </button>
      </div>
    </div>
  );
}

// ─── Section card wrapper ──────────────────────────────────────────────────────

function SectionCard({
  title,
  subtitle,
  action,
  children,
  className,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("bg-card border border-border rounded-xl overflow-hidden", className)}>
      <div className="px-4 md:px-5 py-3 border-b border-border flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
          {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      {children}
    </div>
  );
}

// ─── Supplier card (for Dostawcy tab) ─────────────────────────────────────────

function SupplierCard({
  supplier,
  rank,
  totalAllSpend,
}: {
  supplier: ReportSupplierRow;
  rank: number;
  totalAllSpend: number;
}) {
  const [open, setOpen] = useState(false);
  const [showAll, setShowAll] = useState(false);

  const pct = totalAllSpend > 0 ? (supplier.totalSpend / totalAllSpend) * 100 : 0;
  const color = CHART_COLORS[rank % CHART_COLORS.length];
  const visibleProducts = supplier.topProducts.slice(0, showAll ? 15 : 5);

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full text-left px-4 md:px-6 pt-4 pb-3 hover:bg-secondary/20 transition-colors"
      >
        <div className="flex items-center justify-between gap-3 mb-3">
          <div className="flex items-center gap-3 min-w-0">
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold shrink-0 text-white"
              style={{ background: color }}
            >
              {rank + 1}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground truncate">{supplier.supplierName}</p>
              <p className="text-xs text-muted-foreground">
                {supplier.invoiceCount} {supplier.invoiceCount === 1 ? "faktura" : supplier.invoiceCount < 5 ? "faktury" : "faktur"} · {supplier.productCount} produktów
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <div className="text-right">
              <p className="text-base font-bold text-foreground">{formatPrice(supplier.totalSpend)}</p>
              <p className="text-xs text-muted-foreground">{pct.toFixed(1)}% budżetu</p>
            </div>
            {open ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
          </div>
        </div>
        <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
          <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: color }} />
        </div>
      </button>

      {open && (
        <>
          <div className="border-t border-border">
            <div className="divide-y divide-border">
              {visibleProducts.map((p, i) => (
                <div key={i} className="px-4 md:px-6 py-2.5 grid grid-cols-[1fr_auto_auto] gap-3 items-center">
                  <p className="text-sm text-foreground truncate">{p.productName}</p>
                  <p className="text-xs text-muted-foreground text-right">
                    {p.totalQuantity % 1 === 0 ? p.totalQuantity : p.totalQuantity.toFixed(2)} {p.unit}
                  </p>
                  <p className="text-sm font-semibold text-foreground text-right w-24">
                    {formatPrice(p.totalCost)}
                  </p>
                </div>
              ))}
            </div>
            {supplier.topProducts.length > 5 && (
              <button
                className="w-full py-2.5 text-xs text-muted-foreground hover:text-foreground flex items-center justify-center gap-1 border-t border-border bg-secondary/20 transition-colors"
                onClick={(e) => { e.stopPropagation(); setShowAll((v) => !v); }}
              >
                {showAll
                  ? <><ChevronUp className="w-3.5 h-3.5" />Zwiń</>
                  : <><ChevronDown className="w-3.5 h-3.5" />Pokaż wszystkie ({supplier.topProducts.length})</>}
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ─── Products table (for Produkty tab) ────────────────────────────────────────

function pctVsOverall(p: ProductWithImpact): number | null {
  return p.overallAvgPrice != null && p.overallAvgPrice > 0
    ? ((p.avgPrice - p.overallAvgPrice) / p.overallAvgPrice) * 100
    : null;
}

// Scalona zakładka „Produkty": ceny + ilości + „vs zwykle" + flaga oszczędności.
function ProductsTable({ products }: { products: ProductWithImpact[] }) {
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<"cost" | "price" | "qty" | "overprice">("cost");

  const filtered = useMemo(() => {
    let list = [...products];
    if (search) {
      const q = search.toLowerCase();
      list = list.filter((p) => p.productName.toLowerCase().includes(q));
    }
    if (sortBy === "cost") list.sort((a, b) => b.totalCost - a.totalCost);
    if (sortBy === "price") list.sort((a, b) => b.pricePct - a.pricePct);
    if (sortBy === "qty") list.sort((a, b) => b.qtyPct - a.qtyPct);
    if (sortBy === "overprice") list.sort((a, b) => (pctVsOverall(b) ?? -999) - (pctVsOverall(a) ?? -999));
    return list.slice(0, 100);
  }, [products, search, sortBy]);

  const sorts: { id: typeof sortBy; label: string }[] = [
    { id: "cost", label: "Wg kosztu" },
    { id: "price", label: "Zmiana ceny" },
    { id: "qty", label: "Zmiana ilości" },
    { id: "overprice", label: "Powyżej normy" },
  ];

  return (
    <div>
      <div className="flex flex-wrap gap-2 p-4 md:px-5 items-center">
        <input
          type="text"
          placeholder="Szukaj produktu..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 min-w-[160px] text-sm border border-border rounded-lg px-3 py-2 bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
        <div className="flex gap-1.5 overflow-x-auto scrollbar-none">
          {sorts.map((s) => (
            <button
              key={s.id}
              onClick={() => setSortBy(s.id)}
              className={cn(
                "shrink-0 text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors",
                sortBy === s.id
                  ? "border-primary text-primary bg-primary/5"
                  : "border-border text-muted-foreground hover:text-foreground",
              )}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="py-10 text-center text-sm text-muted-foreground">Brak wyników</div>
      ) : (
        <>
          {/* Desktop: tabela */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full min-w-[720px] tabular-nums">
              <thead>
                <tr className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground bg-secondary/30">
                  <th className="text-left px-5 py-2 font-semibold">Produkt</th>
                  <th className="text-right px-3 py-2 font-semibold">Śr. cena</th>
                  <th className="text-right px-3 py-2 font-semibold">vs poprz.</th>
                  <th className="text-right px-3 py-2 font-semibold">vs zwykle</th>
                  <th className="text-right px-3 py-2 font-semibold">Ilość</th>
                  <th className="text-right px-3 py-2 font-semibold">Δ il.</th>
                  <th className="text-right px-5 py-2 font-semibold">Koszt</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map((p, i) => {
                  const vsOverall = pctVsOverall(p);
                  return (
                    <tr key={i}>
                      <td className="px-5 py-2.5 max-w-[280px]">
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm text-foreground truncate">{p.productName}</span>
                          {p.cheaperSupplierName && (
                            <span className="shrink-0 inline-flex items-center gap-0.5 text-[10px] font-medium text-primary bg-primary/10 rounded-full px-1.5 py-0.5">
                              taniej u {p.cheaperSupplierName} {signedPct(-(p.cheaperPct ?? 0))}
                            </span>
                          )}
                        </div>
                        <span className="text-[11px] text-muted-foreground">{p.unit}{p.supplierName ? ` · ${p.supplierName}` : ""}</span>
                      </td>
                      <td className="text-right px-3 py-2.5 text-sm font-medium text-foreground">{formatPrice(p.avgPrice)}</td>
                      <td className={cn("text-right px-3 py-2.5 text-xs font-medium", costTone(p.prevMonthAvgPrice != null ? p.pricePct : null))}>{p.prevMonthAvgPrice != null ? signedPct(p.pricePct) : "—"}</td>
                      <td className={cn("text-right px-3 py-2.5 text-xs font-medium", costTone(vsOverall))}>{vsOverall == null ? "—" : signedPct(vsOverall)}</td>
                      <td className="text-right px-3 py-2.5 text-xs">
                        <div className="text-foreground">{fmtQty(p.totalQuantity)} {p.unit}</div>
                        {p.prevMonthTotalQuantity != null && (
                          <div className="text-[10px] text-muted-foreground">z {fmtQty(p.prevMonthTotalQuantity)}</div>
                        )}
                      </td>
                      <td className={cn("text-right px-3 py-2.5 text-xs font-medium", p.prevMonthTotalQuantity == null ? "text-muted-foreground" : p.qtyPct > 0 ? "text-amber-600" : p.qtyPct < 0 ? "text-blue-600" : "text-muted-foreground")}>{p.prevMonthTotalQuantity != null && p.prevMonthTotalQuantity > 0 ? signedPct(p.qtyPct) : "—"}</td>
                      <td className="text-right px-5 py-2.5 text-sm font-semibold text-foreground">{formatPrice(p.totalCost)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile: karty 2-liniowe */}
          <div className="md:hidden divide-y divide-border">
            {filtered.map((p, i) => {
              const vsOverall = pctVsOverall(p);
              return (
                <div key={i} className="px-4 py-3 flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-foreground truncate">{p.productName}</p>
                    {p.cheaperSupplierName && (
                      <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-primary bg-primary/10 rounded-full px-1.5 py-0.5 mt-0.5">
                        taniej u {p.cheaperSupplierName} {signedPct(-(p.cheaperPct ?? 0))}
                      </span>
                    )}
                    <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5 text-[11px] text-muted-foreground">
                      <span>vs poprz. <span className={cn("font-medium", costTone(p.prevMonthAvgPrice != null ? p.pricePct : null))}>{p.prevMonthAvgPrice != null ? signedPct(p.pricePct) : "—"}</span></span>
                      <span>vs zwykle <span className={cn("font-medium", costTone(vsOverall))}>{vsOverall == null ? "—" : signedPct(vsOverall)}</span></span>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-semibold text-foreground tabular-nums">{formatPrice(p.avgPrice)}</p>
                    <p className="text-[11px] text-muted-foreground tabular-nums">
                      {fmtQty(p.totalQuantity)} {p.unit}
                      {p.prevMonthTotalQuantity != null && p.prevMonthTotalQuantity > 0 && (
                        <span className={cn("ml-1 font-medium", p.qtyPct > 0 ? "text-amber-600" : p.qtyPct < 0 ? "text-blue-600" : "")}>{signedPct(p.qtyPct)}</span>
                      )}
                    </p>
                    {p.prevMonthTotalQuantity != null && (
                      <p className="text-[10px] text-muted-foreground tabular-nums">poprz. {fmtQty(p.prevMonthTotalQuantity)} {p.unit}</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

// ─── CategoryBarChart (horizontal bar chart for Kategorie tab) ────────────────

// ─── Category spend grouping hook ───────────────────────────────────────────

function useCategoryGroupData(currentData: any[] | undefined, prevData: any[] | undefined) {
  return useMemo(() => {
    if (!currentData) return [];
    const map = new Map<string, number>();
    for (const item of currentData) {
      const cat = item.category ?? "inne";
      map.set(cat, (map.get(cat) ?? 0) + item.totalSpend);
    }
    const prevMap = new Map<string, number>();
    if (prevData) {
      for (const item of prevData) {
        const cat = item.category ?? "inne";
        prevMap.set(cat, (prevMap.get(cat) ?? 0) + item.totalSpend);
      }
    }
    return Array.from(map.entries())
      .map(([id, spend]) => {
        const catDef = CATEGORIES.find((c) => c.id === id);
        const prevSpend = prevMap.get(id) ?? 0;
        const trend = prevSpend > 0 ? ((spend - prevSpend) / prevSpend) * 100 : null;
        const shortLabel = (catDef?.label ?? "Inne").split(" / ")[0].substring(0, 16);
        return {
          id,
          label: catDef?.label ?? "Inne",
          shortLabel,
          spend,
          prevSpend,
          trend,
        };
      })
      .sort((a, b) => b.spend - a.spend);
  }, [currentData, prevData]);
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
          {d.trend > 0 ? "+" : ""}{d.trend.toFixed(1)}% vs poprz. miesiąc
        </p>
      )}
    </div>
  );
}

// ─── Category Spend Comparison Table ───────────────────────────────────────────

function CategoryComparisonTable({
  groups,
  total,
}: {
  groups: any[];
  total: number;
}) {
  return (
    <div className="border-t border-border">
      <div className="grid grid-cols-[1fr_auto_auto] gap-x-4 px-5 py-2 bg-secondary/30 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
        <span>Kategoria</span>
        <span className="text-right">Udział</span>
        <span className="text-right w-16">vs poprz.</span>
      </div>
      <div className="divide-y divide-border/50">
        {groups.map((g, i) => {
          const pct = total > 0 ? (g.spend / total) * 100 : 0;
          return (
            <Link
              key={g.id}
              href={`/products?category=${g.id}`}
              className="flex items-center px-5 py-2 gap-3 hover:bg-secondary/40 transition-colors"
              title={`Pokaż produkty: ${g.label}`}
            >
              <div className="w-2 h-2 rounded-full shrink-0" style={{ background: CHART_COLORS[i % CHART_COLORS.length] }} />
              <span className="text-xs text-foreground flex-1 truncate">{g.label}</span>
              <span className="text-xs text-muted-foreground tabular-nums">{pct.toFixed(1)}%</span>
              {g.trend != null ? (
                <span className={cn("text-xs font-bold tabular-nums flex items-center gap-0.5 w-16 justify-end", g.trend > 0 ? "text-red-500" : "text-emerald-600")}>
                  {g.trend > 0 ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />}
                  {Math.abs(g.trend).toFixed(1)}%
                </span>
              ) : (
                <span className="text-xs text-muted-foreground/40 w-16 text-right">—</span>
              )}
            </Link>
          );
        })}
      </div>
    </div>
  );
}

// ─── Category Bar Chart ────────────────────────────────────────────────────────

function CategoryBarChart({ month }: { month: string }) {
  const { selectedId: costCenterId } = useCostCenter();
  const ccParam = costCenterId != null ? { costCenterId } : {};
  const prevMonthStr = prevMonth(month);

  const { data: currentData, isLoading } = useGetCategorySpend(
    { month, ...ccParam },
    { query: { queryKey: ["category-spend", month, costCenterId] } },
  );
  const { data: prevData } = useGetCategorySpend(
    { month: prevMonthStr, ...ccParam },
    { query: { queryKey: ["category-spend", prevMonthStr, costCenterId] } },
  );

  const groups = useCategoryGroupData(currentData, prevData);

  const total = groups.reduce((s, g) => s + g.spend, 0);

  if (isLoading) return <Skeleton className="h-80 rounded-xl" />;
  if (!groups.length) return (
    <div className="bg-card border border-border rounded-xl py-16 text-center">
      <p className="text-sm text-muted-foreground">Brak danych kategorii za {monthLabel(month)}</p>
    </div>
  );

  const barData = groups.map((g, i) => ({
    ...g,
    fill: CHART_COLORS[i % CHART_COLORS.length],
    pct: total > 0 ? (g.spend / total) * 100 : 0,
  }));

  const barHeight = Math.max(260, groups.length * 44);

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
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

function CategoryTrendChart({ months: numMonths = 6 }: { months?: number }) {
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

// ─── Cost center comparison ────────────────────────────────────────────────────

function CostCenterComparisonSection({ month }: { month: string }) {
  const { data, isLoading } = useGetReportsCostCenters(
    { month },
    { query: { queryKey: ["reports-cost-centers", month] } },
  );

  if (isLoading) return <Skeleton className="h-32 rounded-xl" />;
  if (!data || data.length <= 1) return null;

  const total = data.reduce((s, r) => s + r.totalAmount, 0);

  return (
    <SectionCard title="Porównanie centrów kosztów">
      <div className="p-4 md:p-5 space-y-3">
        {[...data].sort((a, b) => b.totalAmount - a.totalAmount).map((r, i) => {
          const pct = total > 0 ? (r.totalAmount / total) * 100 : 0;
          const color = CHART_COLORS[i % CHART_COLORS.length];
          const hasChange = r.changePercent != null;
          const up = (r.changePercent ?? 0) > 0;
          return (
            <div key={r.costCenterId ?? "none"}>
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-2 min-w-0">
                  <div
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ background: r.costCenterColor ?? color }}
                  />
                  <span className="text-sm font-medium text-foreground truncate">
                    {r.costCenterName ?? "Bez centrum"}
                  </span>
                  <span className="text-[10px] text-muted-foreground">
                    {r.invoiceCount} {r.invoiceCount === 1 ? "faktura" : "faktur"}
                  </span>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  {hasChange && (
                    <span
                      className={cn(
                        "text-xs font-bold flex items-center gap-0.5",
                        up ? "text-red-500" : "text-emerald-600",
                      )}
                    >
                      {up ? <ArrowUp className="w-2.5 h-2.5" /> : <ArrowDown className="w-2.5 h-2.5" />}
                      {Math.abs(r.changePercent!).toFixed(1)}%
                    </span>
                  )}
                  <span className="text-sm font-bold tabular-nums">{formatPrice(r.totalAmount)}</span>
                  <span className="text-xs text-muted-foreground w-10 text-right tabular-nums">
                    {pct.toFixed(1)}%
                  </span>
                </div>
              </div>
              <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{ width: `${pct}%`, background: r.costCenterColor ?? color }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </SectionCard>
  );
}

// ─── Main page ─────────────────────────────────────────────────────────────────

// ─── Answer-first: pomocnicze + karty ─────────────────────────────────────────

const fmtQty = (v: number) => new Intl.NumberFormat("pl-PL", { maximumFractionDigits: 1 }).format(v);
const signedPct = (v: number | null | undefined) => (v == null ? "—" : `${v > 0 ? "+" : ""}${v.toFixed(1)}%`);
// Koszty: mniej = dobrze (zielony), więcej = źle (czerwony).
const costTone = (v: number | null | undefined) =>
  v == null ? "text-muted-foreground" : v < 0 ? "text-emerald-600" : v > 0 ? "text-destructive" : "text-muted-foreground";
const spendWord = (v: number | null | undefined) =>
  v == null ? "" : v < 0 ? "mniej" : v > 0 ? "więcej" : "tyle samo";

function SpendHero({ bridge, monthName }: { bridge: SpendBridge; monthName: string }) {
  const vsPrev = bridge.prevSpend > 0 ? (bridge.deltaSpend / bridge.prevSpend) * 100 : null;
  const vsAvg =
    bridge.avgMonthlySpend && bridge.avgMonthlySpend > 0
      ? ((bridge.currentSpend - bridge.avgMonthlySpend) / bridge.avgMonthlySpend) * 100
      : null;
  return (
    <div className="bg-card border border-border rounded-xl p-5 md:p-6">
      <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">Wydatki · {monthName}</p>
      <p className="text-3xl md:text-4xl font-bold text-foreground tabular-nums mt-1">{formatPrice(bridge.currentSpend)}</p>
      <div className="flex flex-wrap gap-2 mt-3">
        <span className="inline-flex items-center gap-1.5 rounded-lg bg-secondary/60 px-3 py-1.5 text-sm">
          <span className="text-muted-foreground">vs poprzedni miesiąc:</span>
          <span className={cn("font-semibold", costTone(vsPrev))}>
            {signedPct(vsPrev)} {vsPrev != null && `(${bridge.deltaSpend > 0 ? "+" : ""}${formatPrice(bridge.deltaSpend)})`}
          </span>
        </span>
        {vsAvg != null && (
          <span className="inline-flex items-center gap-1.5 rounded-lg bg-secondary/60 px-3 py-1.5 text-sm">
            <span className="text-muted-foreground">vs zwykle:</span>
            <span className={cn("font-semibold", costTone(vsAvg))}>
              o {Math.abs(vsAvg).toFixed(1)}% {spendWord(vsAvg)} niż średnia
            </span>
          </span>
        )}
      </div>
    </div>
  );
}

function WhyBreakdown({ bridge }: { bridge: SpendBridge }) {
  const other = bridge.newEffect + bridge.droppedEffect + bridge.otherEffect;
  const rows = [
    { label: "Zmiany cen", hint: "ceny surowców w górę/dół", amount: bridge.priceEffect },
    { label: "Zmiany ilości", hint: "kupiłeś więcej/mniej", amount: bridge.volumeEffect },
    { label: "Nowe / inne pozycje", hint: "nowe, zniknięte, mix", amount: other },
  ];
  const max = Math.max(1, ...rows.map((r) => Math.abs(r.amount)));
  return (
    <div>
      <p className="px-4 md:px-5 pt-4 text-sm text-foreground">
        Różnica{" "}
        <span className={cn("font-semibold", costTone(bridge.deltaSpend))}>
          {bridge.deltaSpend > 0 ? "+" : ""}{formatPrice(bridge.deltaSpend)}
        </span>{" "}
        vs poprzedni miesiąc bierze się z:
      </p>
      <div className="p-4 md:p-5 space-y-2.5">
        {rows.map((r) => (
          <div key={r.label} className="flex items-center gap-3">
            <div className="w-32 sm:w-40 shrink-0">
              <p className="text-sm text-foreground leading-tight">{r.label}</p>
              <p className="text-[11px] text-muted-foreground leading-tight">{r.hint}</p>
            </div>
            <div className="flex-1 h-2 rounded-full bg-secondary overflow-hidden">
              <div
                className={cn("h-full rounded-full", r.amount < 0 ? "bg-emerald-500" : "bg-destructive")}
                style={{ width: `${Math.min(100, (Math.abs(r.amount) / max) * 100)}%` }}
              />
            </div>
            <div className={cn("w-24 text-right text-sm font-semibold tabular-nums shrink-0", costTone(r.amount))}>
              {r.amount > 0 ? "+" : ""}{formatPrice(r.amount)}
            </div>
          </div>
        ))}
      </div>
      {(bridge.topPriceDrivers.length > 0 || bridge.topVolumeDrivers.length > 0) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 px-4 md:px-5 pb-4">
          {bridge.topPriceDrivers.length > 0 && (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1.5">Ceny w górę ciągnęły</p>
              <ul className="space-y-1">
                {bridge.topPriceDrivers.map((d, i) => (
                  <li key={i} className="flex justify-between gap-2 text-xs">
                    <span className="truncate text-foreground">{d.productName}</span>
                    <span className="text-destructive font-medium tabular-nums shrink-0">+{formatPrice(d.amount)} ({signedPct(d.pricePct)})</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {bridge.topVolumeDrivers.length > 0 && (
            <div>
              <p className="text-xs font-medium text-muted-foreground mb-1.5">Kupiłeś więcej</p>
              <ul className="space-y-1">
                {bridge.topVolumeDrivers.map((d, i) => (
                  <li key={i} className="flex justify-between gap-2 text-xs">
                    <span className="truncate text-foreground">{d.productName}</span>
                    <span className="text-amber-600 font-medium tabular-nums shrink-0">+{formatPrice(d.amount)} ({signedPct(d.qtyPct)})</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function PriceBenchmarkList({ rows }: { rows: SpendBridge["priceBenchmark"] }) {
  if (rows.length === 0) return <div className="px-4 md:px-5 py-6 text-sm text-muted-foreground">Brak danych.</div>;
  return (
    <div className="divide-y divide-border">
      {rows.map((r, i) => (
        <div key={i} className="px-4 md:px-5 py-2.5 flex items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-sm text-foreground truncate">{r.productName}</p>
            <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5 text-[11px] text-muted-foreground">
              <span>vs poprz. <span className={cn("font-medium", costTone(r.pctVsPrev))}>{r.pctVsPrev == null ? "—" : signedPct(r.pctVsPrev)}</span></span>
              <span>vs zwykle <span className={cn("font-medium", costTone(r.pctVsOverall))}>{r.pctVsOverall == null ? "—" : signedPct(r.pctVsOverall)}</span></span>
            </div>
          </div>
          <div className="text-right shrink-0">
            <p className="text-sm font-semibold text-foreground tabular-nums">{formatPrice(r.avgPrice)}</p>
            <p className="text-[10px] text-muted-foreground">/{r.unit}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

function QuantityMoversList({ rows }: { rows: SpendBridge["quantityMovers"] }) {
  if (rows.length === 0) return <div className="px-4 md:px-5 py-6 text-sm text-muted-foreground">Brak danych.</div>;
  return (
    <div className="divide-y divide-border">
      {rows.map((r, i) => (
        <div key={i} className="px-4 md:px-5 py-2.5 flex items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-sm text-foreground truncate">{r.productName}</p>
            {r.prevQty != null && (
              <p className="text-[11px] text-muted-foreground">poprzednio {fmtQty(r.prevQty)} {r.unit}</p>
            )}
          </div>
          <div className="text-right shrink-0">
            <p className="text-sm font-semibold text-foreground tabular-nums">{fmtQty(r.currentQty)} {r.unit}</p>
            {r.qtyPct != null && (
              <p className={cn("text-[11px] font-medium tabular-nums", r.qtyPct > 0 ? "text-amber-600" : r.qtyPct < 0 ? "text-blue-600" : "text-muted-foreground")}>
                {signedPct(r.qtyPct)}
              </p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

export default function Reports() {
  const [, navigate] = useLocation();
  const [month, setMonth] = useState(currentMonth);
  // On first load, default the view to the month where the user's data actually is —
  // the month with the highest spend. Freshly imported invoices are usually from a
  // prior month, so defaulting to the (near-empty) current calendar month made the
  // reports look broken / "out of sync". In steady use this converges to the current
  // month once it accumulates the most spend.
  const [autoMonthDone, setAutoMonthDone] = useState(false);
  const { data: trendForDefault } = useGetCategorySpendTrend(
    { months: 12 },
    { query: { queryKey: ["reports-default-trend"] } },
  );
  useEffect(() => {
    if (autoMonthDone || !trendForDefault) return;
    const spendByMonth = new Map<string, number>();
    for (const r of trendForDefault) {
      spendByMonth.set(r.month, (spendByMonth.get(r.month) ?? 0) + (r.totalSpend ?? 0));
    }
    let best: string | null = null;
    let bestSpend = 0;
    for (const [m, s] of spendByMonth) {
      if (s > bestSpend) {
        bestSpend = s;
        best = m;
      }
    }
    if (best && best !== currentMonth()) setMonth(best);
    setAutoMonthDone(true);
  }, [trendForDefault, autoMonthDone]);
  const [tab, setTab] = useState("podsumowanie");
  const [trendMonths, setTrendMonths] = useState(6);
  const { selectedId: costCenterId } = useCostCenter();
  const ccParam = costCenterId != null ? { costCenterId } : {};

  const { data, isLoading } = useGetMonthlyReport(
    { month, ...ccParam },
    { query: { queryKey: ["monthly-report", month, costCenterId] } },
  );
  const { data: prevData } = useGetMonthlyReport(
    { month: prevMonth(month), ...ccParam },
    { query: { queryKey: ["monthly-report", prevMonth(month), costCenterId] } },
  );
  const { data: alerts } = useGetDashboardActiveAlerts({
    query: { queryKey: ["dashboard-active-alerts"] },
  });
  const { data: bridge } = useGetSpendBridge(
    { month, ...ccParam },
    { query: { queryKey: ["spend-bridge", month, costCenterId] } },
  );

  const allProducts = useMemo<ProductWithImpact[]>(() => {
    if (!data) return [];
    return computeImpacts(data.topProducts);
  }, [data]);

  const prevMonthTotalSpend = prevData?.totalSpend ?? 0;
  const momPct =
    prevMonthTotalSpend > 0
      ? ((( data?.totalSpend ?? 0) - prevMonthTotalSpend) / prevMonthTotalSpend) * 100
      : 0;

  const totalPriceImpact = useMemo(
    () => allProducts.filter((p) => p.priceImpact > 0).reduce((s, p) => s + p.priceImpact, 0),
    [allProducts],
  );

  const alertCount = alerts?.length ?? 0;
  const criticalCount = alerts?.filter((a) => a.changePercent > a.thresholdPercent * 1.5).length ?? 0;

  const isCurrentMonth = month === currentMonth();

  return (
    <Layout>
      <div className="max-w-5xl mx-auto px-4 md:px-6 py-5 md:py-7">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center gap-3 mb-5 md:mb-6">
          <div className="flex-1 min-w-0">
            <PageHeader title="Raporty" />
            <p className="text-xs text-muted-foreground mt-0.5">
              Analiza zakupów · {monthLabel(month)}
              {prevMonthTotalSpend > 0 && (
                <span className="ml-2 text-muted-foreground/70">
                  Porównaj z: {monthLabel(prevMonth(month))}
                </span>
              )}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                exportToCsv(
                  [
                    ["Produkt", "Jednostka", "Ilość", "Śr. cena", "Łączny koszt"],
                    ...(data?.topProducts ?? []).map((p) => [
                      p.productName,
                      p.unit,
                      p.totalQuantity,
                      p.avgPrice,
                      p.totalCost,
                    ]),
                  ],
                  `raport-${month}-${todaySlug()}`,
                )
              }
              className="gap-1.5 text-xs hidden md:flex"
            >
              <Download className="w-3.5 h-3.5" />
              Eksport CSV
            </Button>
            <div className="flex items-center border border-border rounded-lg overflow-hidden bg-card">
              <button
                onClick={() => setMonth(prevMonth(month))}
                className="p-2 hover:bg-secondary/50 transition-colors"
              >
                <ChevronLeft className="w-4 h-4 text-muted-foreground" />
              </button>
              <span className="text-sm font-medium px-3 text-foreground min-w-[120px] text-center">
                {monthLabel(month)}
              </span>
              <button
                onClick={() => setMonth(nextMonth(month))}
                disabled={isCurrentMonth}
                className={cn(
                  "p-2 hover:bg-secondary/50 transition-colors",
                  isCurrentMonth && "opacity-30 cursor-not-allowed",
                )}
              >
                <ChevronRight className="w-4 h-4 text-muted-foreground" />
              </button>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList className="mb-5 md:mb-6 flex-wrap h-auto gap-0.5">
            <TabsTrigger value="podsumowanie">Przegląd</TabsTrigger>
            <TabsTrigger value="produkty">Produkty</TabsTrigger>
            <TabsTrigger value="dostawcy">Dostawcy</TabsTrigger>
            <TabsTrigger value="kategorie">Kategorie</TabsTrigger>
          </TabsList>

          {/* ── PODSUMOWANIE ─────────────────────────────────────────────────── */}
          <TabsContent value="podsumowanie" className="space-y-5 md:space-y-6">
            {/* 1. Ile wydałeś + porównania (hero) i dlaczego tyle */}
            {isLoading ? (
              <Skeleton className="h-40 rounded-xl" />
            ) : bridge && (data?.totalSpend ?? 0) > 0 ? (
              <>
                <SpendHero bridge={bridge} monthName={monthLabel(month)} />
                <SectionCard
                  title="Dlaczego tyle?"
                  subtitle="Ile z różnicy to zmiany cen, a ile to że kupiłeś więcej lub mniej"
                >
                  <WhyBreakdown bridge={bridge} />
                </SectionCard>
              </>
            ) : null}

            {/* 2. Ceny produktów vs zwykle + ilości */}
            {!isLoading && bridge && (data?.totalSpend ?? 0) > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <SectionCard
                  title="Ceny produktów"
                  subtitle="Średnia cena teraz vs poprzedni miesiąc i vs zwykle"
                >
                  <PriceBenchmarkList rows={bridge.priceBenchmark} />
                </SectionCard>
                <SectionCard
                  title="Ilości produktów"
                  subtitle="Ile kupiłeś w tym miesiącu vs poprzedni"
                >
                  <QuantityMoversList rows={bridge.quantityMovers} />
                </SectionCard>
              </div>
            )}

            {/* 3. Trend wydatków — główny wykres, pełna szerokość */}
            {!isLoading && data && (data?.totalSpend ?? 0) > 0 && (
              <SectionCard
                title="Trend wydatków"
                subtitle="Jak zmieniają się miesięczne zakupy surowców"
                action={
                  <select
                    value={trendMonths}
                    onChange={(e) => setTrendMonths(Number(e.target.value))}
                    className="text-xs border border-border rounded-md px-2 py-1 bg-background"
                  >
                    <option value={3}>3 miesiące</option>
                    <option value={6}>6 miesięcy</option>
                    <option value={12}>12 miesięcy</option>
                  </select>
                }
              >
                <div className="p-4 md:p-5">
                  <SpendTrendChart months={trendMonths} />
                </div>
              </SectionCard>
            )}

            {/* 4. Porównanie centrów kosztów (tylko gdy skonfigurowane) */}
            <CostCenterComparisonSection month={month} />

            {/* 5. Kategorie + dostawcy — spójne bloki (dwie listy) */}
            {!isLoading && data && (data?.totalSpend ?? 0) > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <SectionCard title="Wydatki wg kategorii">
                  <div className="p-4 md:p-5">
                    <CategoryMiniList month={month} />
                  </div>
                </SectionCard>
                <SectionCard title="Top dostawcy">
                  <TopSuppliersTable
                    suppliers={data?.suppliers ?? []}
                    totalSpend={data?.totalSpend ?? 0}
                    onViewAll={() => setTab("dostawcy")}
                  />
                </SectionCard>
              </div>
            )}

            {/* 6. Alerty + rekomendacje */}
            {!isLoading && data && (data?.totalSpend ?? 0) > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <SectionCard title="Krytyczne alerty">
                  <AlertsList onViewAll={() => navigate("/price-alerts")} />
                </SectionCard>
                <SectionCard title="Rekomendacje AI">
                  <RecommendationsList products={allProducts} />
                </SectionCard>
              </div>
            )}

            {/* Empty state */}
            {!isLoading && (!data || data.totalSpend === 0) && (
              <div className="bg-card border border-border rounded-xl py-20 text-center px-4">
                <FileText className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
                <p className="text-foreground font-medium mb-1">
                  Brak danych za {monthLabel(month)}
                </p>
                <p className="text-sm text-muted-foreground">
                  Zaimportuj faktury, aby zobaczyć raport.
                </p>
              </div>
            )}
          </TabsContent>

          {/* ── PRODUKTY ────────────────────────────────────────────────────── */}
          <TabsContent value="produkty">
            {isLoading ? (
              <Skeleton className="h-64 rounded-xl" />
            ) : allProducts.length > 0 ? (
              <div className="bg-card border border-border rounded-xl overflow-hidden">
                <div className="px-4 md:px-5 py-3 border-b border-border flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="text-sm font-semibold text-foreground">Produkty · {allProducts.length}</h3>
                    <p className="text-[11px] text-muted-foreground mt-0.5">Ceny i ilości w jednym miejscu — vs poprzedni miesiąc, vs zwykle, gdzie taniej</p>
                  </div>
                  <span className="text-xs text-muted-foreground shrink-0">
                    Łącznie {formatPrice(data?.totalSpend ?? 0)}
                  </span>
                </div>
                <ProductsTable products={allProducts} />
              </div>
            ) : (
              <div className="bg-card border border-border rounded-xl py-20 text-center px-4">
                <Package className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
                <p className="text-foreground font-medium mb-1">Brak produktów za {monthLabel(month)}</p>
                <p className="text-sm text-muted-foreground">Zaimportuj faktury, aby zobaczyć produkty.</p>
              </div>
            )}
          </TabsContent>

          {/* ── DOSTAWCY ────────────────────────────────────────────────────── */}
          <TabsContent value="dostawcy">
            {isLoading ? (
              <div className="space-y-4">
                {[0, 1, 2].map((i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
              </div>
            ) : (data?.suppliers ?? []).length > 0 ? (
              <div className="space-y-4">
                {[...(data?.suppliers ?? [])].sort((a, b) => b.totalSpend - a.totalSpend).map((s, i) => (
                  <SupplierCard
                    key={s.supplierId}
                    supplier={s}
                    rank={i}
                    totalAllSpend={data?.totalSpend ?? 0}
                  />
                ))}
              </div>
            ) : (
              <div className="bg-card border border-border rounded-xl py-20 text-center px-4">
                <Users className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
                <p className="text-foreground font-medium mb-1">Brak dostawców za {monthLabel(month)}</p>
              </div>
            )}
          </TabsContent>

          {/* ── KATEGORIE ───────────────────────────────────────────────────── */}
          <TabsContent value="kategorie" className="space-y-5">
            <CategoryBarChart month={month} />
            <SectionCard title={`Trend wg kategorii · ${trendMonths} miesięcy`}>
              <div className="p-4 md:p-5">
                <div className="flex justify-end mb-3">
                  <select
                    value={trendMonths}
                    onChange={(e) => setTrendMonths(Number(e.target.value))}
                    className="text-xs border border-border rounded-md px-2 py-1 bg-background"
                  >
                    <option value={3}>3 miesiące</option>
                    <option value={6}>6 miesięcy</option>
                    <option value={12}>12 miesięcy</option>
                  </select>
                </div>
                <CategoryTrendChart months={trendMonths} />
              </div>
            </SectionCard>
          </TabsContent>

        </Tabs>
      </div>
    </Layout>
  );
}
