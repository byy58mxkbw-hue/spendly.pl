import { useState, useMemo } from "react";
import { Layout, PageHeader } from "@/components/layout";
import {
  useGetMonthlyReport,
  useGetCategorySpend,
  useGetCategorySpendTrend,
  useGetDashboardActiveAlerts,
  useGetReportsCostCenters,
} from "@workspace/api-client-react";
import type { ReportProductRow, ReportSupplierRow } from "@workspace/api-client-react";
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
  children,
  className,
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("bg-card border border-border rounded-xl overflow-hidden", className)}>
      <div className="px-4 md:px-5 py-3 border-b border-border">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
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

function ProductsTable({ products }: { products: ProductWithImpact[] }) {
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<"cost" | "price" | "qty">("cost");

  const filtered = useMemo(() => {
    let list = [...products];
    if (search) {
      const q = search.toLowerCase();
      list = list.filter((p) => p.productName.toLowerCase().includes(q));
    }
    if (sortBy === "cost") list.sort((a, b) => b.totalCost - a.totalCost);
    if (sortBy === "price") list.sort((a, b) => Math.abs(b.pricePct) - Math.abs(a.pricePct));
    if (sortBy === "qty") list.sort((a, b) => Math.abs(b.qtyPct) - Math.abs(a.qtyPct));
    return list;
  }, [products, search, sortBy]);

  return (
    <div>
      <div className="flex gap-2 p-4 md:px-5">
        <input
          type="text"
          placeholder="Szukaj produktu..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 text-sm border border-border rounded-lg px-3 py-2 bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
          className="text-sm border border-border rounded-lg px-3 py-2 bg-background focus:outline-none"
        >
          <option value="cost">Wg kosztu</option>
          <option value="price">Wg zmiany ceny</option>
          <option value="qty">Wg zmiany ilości</option>
        </select>
      </div>
      {sortBy === "qty" ? (
        <div className="grid grid-cols-[1fr_auto_auto_auto_auto_auto] gap-2 px-4 md:px-5 py-2 bg-secondary/30 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
          <div>Produkt</div>
          <div className="text-right w-20">Poprz. mies.</div>
          <div className="text-right w-16">Ten mies.</div>
          <div className="text-right w-16">Zmiana il.</div>
          <div className="text-right w-24">Śr. cena</div>
          <div className="text-right w-24">Łącznie</div>
        </div>
      ) : (
        <div className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-2 px-4 md:px-5 py-2 bg-secondary/30 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
          <div>Produkt</div>
          <div className="text-right w-16">Ilość</div>
          <div className="text-right w-24">Śr. cena</div>
          <div className="text-right w-14">Zmiana ceny</div>
          <div className="text-right w-24">Łącznie</div>
        </div>
      )}
      <div className="divide-y divide-border max-h-[60vh] overflow-y-auto">
        {filtered.slice(0, 50).map((p, i) => (
          <div
            key={i}
            className={cn(
              "grid gap-2 px-4 md:px-5 py-2.5 items-center",
              sortBy === "qty"
                ? "grid-cols-[1fr_auto_auto_auto_auto_auto]"
                : "grid-cols-[1fr_auto_auto_auto_auto]",
            )}
          >
            <div className="min-w-0">
              <p className="text-sm text-foreground truncate">{p.productName}</p>
              {p.supplierName && (
                <p className="text-[10px] text-muted-foreground truncate">{p.supplierName}</p>
              )}
            </div>

            {sortBy === "qty" ? (
              <>
                {/* Previous month quantity */}
                <p className="text-xs text-muted-foreground text-right w-20 tabular-nums">
                  {p.prevMonthTotalQuantity != null
                    ? `${p.prevMonthTotalQuantity % 1 === 0 ? p.prevMonthTotalQuantity : p.prevMonthTotalQuantity.toFixed(1)} ${p.unit}`
                    : "—"}
                </p>
                {/* Current month quantity */}
                <p className="text-xs text-foreground text-right w-16 tabular-nums font-medium">
                  {p.totalQuantity % 1 === 0 ? p.totalQuantity : p.totalQuantity.toFixed(1)} {p.unit}
                </p>
                {/* Quantity % change */}
                {p.prevMonthTotalQuantity != null && p.prevMonthTotalQuantity > 0 ? (
                  <span
                    className={cn(
                      "text-xs font-bold text-right w-16 tabular-nums flex items-center justify-end gap-0.5",
                      p.qtyPct > 0 ? "text-amber-500" : p.qtyPct < 0 ? "text-blue-500" : "text-muted-foreground",
                    )}
                  >
                    {p.qtyPct > 0 ? <ArrowUp className="w-2.5 h-2.5" /> : p.qtyPct < 0 ? <ArrowDown className="w-2.5 h-2.5" /> : null}
                    {p.qtyPct !== 0 ? (p.qtyPct > 0 ? "+" : "") + p.qtyPct.toFixed(1) + "%" : "—"}
                  </span>
                ) : (
                  <span className="text-xs text-muted-foreground text-right w-16">—</span>
                )}
                {/* Avg price */}
                <p className="text-xs text-muted-foreground text-right w-24 tabular-nums">
                  {formatPrice(p.avgPrice)}/{p.unit}
                </p>
              </>
            ) : (
              <>
                <p className="text-xs text-muted-foreground text-right w-16 tabular-nums">
                  {p.totalQuantity % 1 === 0 ? p.totalQuantity : p.totalQuantity.toFixed(1)} {p.unit}
                </p>
                <p className="text-xs text-foreground text-right w-24 tabular-nums">
                  {formatPrice(p.avgPrice)}/{p.unit}
                </p>
                {p.prevMonthAvgPrice != null && p.prevMonthAvgPrice > 0 ? (
                  <span
                    className={cn(
                      "text-xs font-bold text-right w-14 tabular-nums flex items-center justify-end gap-0.5",
                      p.pricePct > 0 ? "text-red-500" : p.pricePct < 0 ? "text-emerald-600" : "text-muted-foreground",
                    )}
                  >
                    {p.pricePct > 0 ? <ArrowUp className="w-2.5 h-2.5" /> : p.pricePct < 0 ? <ArrowDown className="w-2.5 h-2.5" /> : null}
                    {p.pricePct !== 0 ? Math.abs(p.pricePct).toFixed(1) + "%" : "—"}
                  </span>
                ) : (
                  <span className="text-xs text-muted-foreground text-right w-14">—</span>
                )}
              </>
            )}

            <p className="text-sm font-semibold text-foreground text-right w-24 tabular-nums">
              {formatPrice(p.totalCost)}
            </p>
          </div>
        ))}
        {filtered.length === 0 && (
          <div className="py-8 text-center text-sm text-muted-foreground">
            Brak wyników
          </div>
        )}
      </div>
    </div>
  );
}

// ─── CategoryBarChart (horizontal bar chart for Kategorie tab) ────────────────

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

  const groups = useMemo(() => {
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
            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const d = payload[0]?.payload as typeof barData[0];
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
              }}
            />
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

      {/* MoM comparison strip */}
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
              <div key={g.id} className="flex items-center px-5 py-2 gap-3">
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
              </div>
            );
          })}
        </div>
      </div>
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

export default function Reports() {
  const [month, setMonth] = useState(currentMonth);
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
            <TabsTrigger value="podsumowanie">Podsumowanie</TabsTrigger>
            <TabsTrigger value="produkty">Produkty</TabsTrigger>
            <TabsTrigger value="dostawcy">Dostawcy</TabsTrigger>
            <TabsTrigger value="kategorie">Kategorie</TabsTrigger>
            <TabsTrigger value="ceny">Ceny</TabsTrigger>
            <TabsTrigger value="ilosci">Ilości</TabsTrigger>
            <TabsTrigger value="anomalie">
              Anomalie
              {alertCount > 0 && (
                <span className="ml-1.5 text-[10px] bg-red-500 text-white rounded-full px-1.5 py-0.5 font-bold leading-none">
                  {alertCount}
                </span>
              )}
            </TabsTrigger>
          </TabsList>

          {/* ── PODSUMOWANIE ─────────────────────────────────────────────────── */}
          <TabsContent value="podsumowanie" className="space-y-5 md:space-y-6">
            {/* KPI cards */}
            {isLoading ? (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <KpiCard
                  label="Łączne zakupy"
                  value={formatPrice(data?.totalSpend ?? 0)}
                  sub={
                    prevMonthTotalSpend > 0
                      ? `${momPct > 0 ? "+" : ""}${momPct.toFixed(1)}% vs ${monthLabel(prevMonth(month))}`
                      : `${data?.invoiceCount ?? 0} faktur`
                  }
                  subColor={momPct > 0 ? "red" : momPct < 0 ? "green" : "muted"}
                  icon={ShoppingCart}
                />
                <KpiCard
                  label="Wpływ wzrostów cen"
                  value={totalPriceImpact > 0 ? `+${formatPrice(totalPriceImpact)}` : formatPrice(0)}
                  sub={
                    totalPriceImpact > 0 && (data?.totalSpend ?? 0) > 0
                      ? `+${((totalPriceImpact / (data?.totalSpend ?? 1)) * 100).toFixed(1)}% budżetu`
                      : "Brak zmian cen"
                  }
                  subColor={totalPriceImpact > 0 ? "red" : "muted"}
                  icon={TrendingUp}
                  iconBg="bg-red-500/10 text-red-500"
                />
                <KpiCard
                  label="Możliwe oszczędności"
                  value={
                    totalPriceImpact > 0
                      ? formatPrice(Math.round(totalPriceImpact * 0.6))
                      : "—"
                  }
                  sub={totalPriceImpact > 0 ? "potencjalnie" : "Brak anomalii"}
                  subColor="muted"
                  icon={BarChart3}
                  iconBg="bg-emerald-500/10 text-emerald-600"
                />
                <KpiCard
                  label="Aktywne alerty"
                  value={String(alertCount)}
                  sub={criticalCount > 0 ? `${criticalCount} krytycznych` : "Brak krytycznych"}
                  subColor={criticalCount > 0 ? "red" : "muted"}
                  icon={Bell}
                  iconBg={alertCount > 0 ? "bg-amber-500/10 text-amber-500" : "bg-primary/10 text-primary"}
                />
              </div>
            )}

            {/* Cost center comparison (only when multiple centers configured) */}
            <CostCenterComparisonSection month={month} />

            {/* AI Summary */}
            {!isLoading && data && (data?.totalSpend ?? 0) > 0 && (
              <AiSummaryBlock
                totalSpend={data.totalSpend}
                prevSpend={prevMonthTotalSpend}
                topImpact={allProducts}
                momPct={momPct}
              />
            )}

            {/* Impact 3-column */}
            {isLoading ? (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {[0, 1, 2].map((i) => <Skeleton key={i} className="h-56 rounded-xl" />)}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <SectionCard title="Największe przyczyny wzrostu kosztów">
                  <PriceImpactList
                    products={allProducts}
                    onViewAll={() => setTab("ceny")}
                  />
                </SectionCard>
                <SectionCard title="Produkty – największe wzrosty ilości">
                  <QuantityImpactTable
                    products={allProducts}
                    onViewAll={() => setTab("ilosci")}
                  />
                </SectionCard>
                <SectionCard title="Największe wzrosty cen">
                  <PriceChangesTable
                    products={allProducts}
                    onViewAll={() => setTab("ceny")}
                  />
                </SectionCard>
              </div>
            )}

            {/* Charts 3-column */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <SectionCard
                title="Trend wydatków"
                className="md:col-span-1"
              >
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
                  <SpendTrendChart months={trendMonths} />
                </div>
              </SectionCard>

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

            {/* Alerts + recommendations 2-column */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <SectionCard title="Krytyczne alerty">
                <AlertsList onViewAll={() => setTab("anomalie")} />
              </SectionCard>
              <SectionCard title="Rekomendacje AI">
                <RecommendationsList products={allProducts} />
              </SectionCard>
            </div>

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
                <div className="px-4 md:px-5 py-3 border-b border-border flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-foreground">
                    Wszystkie produkty · {allProducts.length}
                  </h3>
                  <span className="text-xs text-muted-foreground">
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

          {/* ── CENY ─────────────────────────────────────────────────────────── */}
          <TabsContent value="ceny">
            {isLoading ? (
              <Skeleton className="h-64 rounded-xl" />
            ) : (
              <div className="bg-card border border-border rounded-xl overflow-hidden">
                <div className="px-4 md:px-5 py-3 border-b border-border">
                  <h3 className="text-sm font-semibold text-foreground">Analiza zmian cen</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Porównanie {monthLabel(month)} vs {monthLabel(prevMonth(month))}
                  </p>
                </div>
                <div className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-2 px-4 md:px-5 py-2 bg-secondary/30 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
                  <div>Produkt</div>
                  <div className="text-right w-24">Poprz. cena</div>
                  <div className="text-right w-24">Obecna cena</div>
                  <div className="text-right w-16">Zmiana %</div>
                  <div className="text-right w-24">Wpływ na koszt</div>
                </div>
                <div className="divide-y divide-border">
                  {[...allProducts]
                    .filter((p) => p.prevMonthAvgPrice != null && p.prevMonthAvgPrice > 0)
                    .sort((a, b) => Math.abs(b.pricePct) - Math.abs(a.pricePct))
                    .map((p, i) => (
                      <div key={i} className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-2 px-4 md:px-5 py-2.5 items-center">
                        <div className="min-w-0">
                          <p className="text-sm text-foreground truncate">{p.productName}</p>
                          {p.supplierName && (
                            <p className="text-[10px] text-muted-foreground">{p.supplierName}</p>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground text-right w-24 tabular-nums">
                          {formatPrice(p.prevMonthAvgPrice ?? 0)}/{p.unit}
                        </p>
                        <p className="text-sm font-medium text-foreground text-right w-24 tabular-nums">
                          {formatPrice(p.avgPrice)}/{p.unit}
                        </p>
                        <span className={cn(
                          "text-xs font-bold text-right w-16 tabular-nums flex items-center justify-end gap-0.5",
                          p.pricePct > 0 ? "text-red-500" : "text-emerald-600"
                        )}>
                          {p.pricePct > 0 ? <ArrowUp className="w-2.5 h-2.5" /> : <ArrowDown className="w-2.5 h-2.5" />}
                          {Math.abs(p.pricePct).toFixed(1)}%
                        </span>
                        <p className={cn(
                          "text-sm font-semibold text-right w-24 tabular-nums",
                          p.priceImpact > 0 ? "text-red-500" : "text-emerald-600"
                        )}>
                          {p.priceImpact > 0 ? "+" : ""}{formatPrice(p.priceImpact)}
                        </p>
                      </div>
                    ))}
                  {allProducts.filter((p) => p.prevMonthAvgPrice != null).length === 0 && (
                    <div className="py-8 text-center text-sm text-muted-foreground">
                      Brak danych porównawczych
                    </div>
                  )}
                </div>
              </div>
            )}
          </TabsContent>

          {/* ── ILOŚCI ────────────────────────────────────────────────────────── */}
          <TabsContent value="ilosci">
            {isLoading ? (
              <Skeleton className="h-64 rounded-xl" />
            ) : (
              <div className="bg-card border border-border rounded-xl overflow-hidden">
                <div className="px-4 md:px-5 py-3 border-b border-border">
                  <h3 className="text-sm font-semibold text-foreground">Analiza ilości zakupów</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Porównanie {monthLabel(month)} vs {monthLabel(prevMonth(month))}
                  </p>
                </div>
                <div className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-2 px-4 md:px-5 py-2 bg-secondary/30 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
                  <div>Produkt</div>
                  <div className="text-right w-20">Poprz. ilość</div>
                  <div className="text-right w-20">Obecna ilość</div>
                  <div className="text-right w-14">Zmiana %</div>
                  <div className="text-right w-24">Łączny koszt</div>
                </div>
                <div className="divide-y divide-border">
                  {[...allProducts]
                    .filter((p) => p.prevMonthTotalQuantity != null && p.prevMonthTotalQuantity > 0)
                    .sort((a, b) => Math.abs(b.qtyPct) - Math.abs(a.qtyPct))
                    .map((p, i) => {
                      const fmtQty = (q: number) =>
                        (q % 1 === 0 ? q.toFixed(0) : q.toFixed(1)) + " " + p.unit;
                      return (
                        <div key={i} className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-2 px-4 md:px-5 py-2.5 items-center">
                          <div className="min-w-0">
                            <p className="text-sm text-foreground truncate">{p.productName}</p>
                            {p.supplierName && (
                              <p className="text-[10px] text-muted-foreground">{p.supplierName}</p>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground text-right w-20 tabular-nums">
                            {fmtQty(p.prevMonthTotalQuantity ?? 0)}
                          </p>
                          <p className="text-sm font-medium text-foreground text-right w-20 tabular-nums">
                            {fmtQty(p.totalQuantity)}
                          </p>
                          <span className={cn(
                            "text-xs font-bold text-right w-14 tabular-nums flex items-center justify-end gap-0.5",
                            p.qtyPct > 0 ? "text-blue-500" : "text-orange-500"
                          )}>
                            {p.qtyPct > 0 ? <ArrowUp className="w-2.5 h-2.5" /> : <ArrowDown className="w-2.5 h-2.5" />}
                            {Math.abs(p.qtyPct).toFixed(1)}%
                          </span>
                          <p className="text-sm font-semibold text-foreground text-right w-24 tabular-nums">
                            {formatPrice(p.totalCost)}
                          </p>
                        </div>
                      );
                    })}
                  {allProducts.filter((p) => p.prevMonthTotalQuantity != null).length === 0 && (
                    <div className="py-8 text-center text-sm text-muted-foreground">
                      Brak danych porównawczych
                    </div>
                  )}
                </div>
              </div>
            )}
          </TabsContent>

          {/* ── ANOMALIE ─────────────────────────────────────────────────────── */}
          <TabsContent value="anomalie" className="space-y-4">
            {/* Triggered price alerts */}
            <div className="bg-card border border-border rounded-xl overflow-hidden">
              <div className="px-4 md:px-5 py-3 border-b border-border flex items-center justify-between">
                <h3 className="text-sm font-semibold text-foreground">Alerty cenowe</h3>
                {alertCount > 0 && (
                  <span className="text-xs bg-red-500/10 text-red-500 font-bold px-2 py-0.5 rounded-full">
                    {alertCount} aktywnych
                  </span>
                )}
              </div>
              <AlertsList />
            </div>

            {/* Quantity anomalies */}
            {allProducts.filter((p) => Math.abs(p.qtyPct) > 40).length > 0 && (
              <div className="bg-card border border-border rounded-xl overflow-hidden">
                <div className="px-4 md:px-5 py-3 border-b border-border">
                  <h3 className="text-sm font-semibold text-foreground">Anomalie ilości (&gt;40% zmiany)</h3>
                </div>
                <div className="divide-y divide-border">
                  {[...allProducts]
                    .filter((p) => Math.abs(p.qtyPct) > 40)
                    .sort((a, b) => Math.abs(b.qtyPct) - Math.abs(a.qtyPct))
                    .map((p, i) => (
                      <div key={i} className="flex items-start gap-3 px-4 md:px-5 py-3">
                        <AlertTriangle
                          className={cn("w-4 h-4 shrink-0 mt-0.5", p.qtyPct > 0 ? "text-amber-500" : "text-blue-400")}
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-foreground">
                            <span className="font-medium">{p.productName}</span>
                            {" "}– zakup{" "}
                            {p.qtyPct > 0 ? "wzrósł" : "spadł"} z{" "}
                            {(p.prevMonthTotalQuantity ?? 0).toFixed(1)} do{" "}
                            {p.totalQuantity.toFixed(1)} {p.unit} (
                            <span className={cn("font-bold", p.qtyPct > 0 ? "text-amber-500" : "text-blue-400")}>
                              {p.qtyPct > 0 ? "+" : ""}
                              {p.qtyPct.toFixed(0)}%
                            </span>
                            )
                          </p>
                          {p.qtyPct > 40 && (
                            <p className="text-[11px] text-muted-foreground mt-0.5">
                              Sprawdź marnowanie lub zmianę receptury
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            )}

            {alertCount === 0 && allProducts.filter((p) => Math.abs(p.qtyPct) > 40).length === 0 && (
              <div className="bg-card border border-border rounded-xl py-20 text-center px-4">
                <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto mb-3" />
                <p className="text-foreground font-medium mb-1">Brak anomalii</p>
                <p className="text-sm text-muted-foreground">
                  Nie wykryto nieprawidłowych cen ani ilości za {monthLabel(month)}.
                </p>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
}
