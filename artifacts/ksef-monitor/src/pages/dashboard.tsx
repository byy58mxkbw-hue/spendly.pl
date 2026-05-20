import { useMemo, useState } from "react";
import { Layout, PageHeader } from "@/components/layout";
import {
  useGetDashboardSummary,
  useGetFoodCostMonthly,
  useGetRecentPurchases,
  useGetDashboardActiveAlerts,
  useGetTopPriceChanges,
  useGetInsights,
} from "@workspace/api-client-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { TrendingUp, TrendingDown, Minus, Users, Package, FileText, Bell, Zap, ChevronRight, AlertTriangle } from "lucide-react";
import { Link } from "wouter";
import { formatPrice, formatPercent, formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { CATEGORIES, categorizeProduct } from "@/lib/categories";
import { PriceHistoryModal } from "./products";

function StatCard({
  label,
  value,
  change,
  icon: Icon,
}: {
  label: string;
  value: string;
  change?: number | null;
  icon: React.ElementType;
}) {
  const isPositive = (change ?? 0) > 0;
  const isNegative = (change ?? 0) < 0;

  return (
    <div className="bg-card border border-border rounded-xl p-6" data-testid="stat-card">
      <div className="flex items-start justify-between mb-4">
        <div className="w-10 h-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
          <Icon className="w-5 h-5" />
        </div>
        {change != null && (
          <div
            className={cn(
              "flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full",
              isPositive && "bg-destructive/10 text-destructive",
              isNegative && "bg-emerald-500/10 text-emerald-600",
              !isPositive && !isNegative && "bg-muted text-muted-foreground"
            )}
          >
            {isPositive ? <TrendingUp className="w-3 h-3" /> : isNegative ? <TrendingDown className="w-3 h-3" /> : <Minus className="w-3 h-3" />}
            {formatPercent(change)}
          </div>
        )}
      </div>
      <p className="text-2xl font-bold text-foreground mb-1">{value}</p>
      <p className="text-sm text-muted-foreground">{label}</p>
    </div>
  );
}

function PriceChangeBadge({ change }: { change: number | null | undefined }) {
  if (change == null) return <span className="text-muted-foreground text-xs">—</span>;
  const up = change > 0;
  const down = change < 0;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 text-xs font-medium px-2 py-0.5 rounded-full",
        up && "bg-destructive/10 text-destructive",
        down && "bg-emerald-500/10 text-emerald-600",
        !up && !down && "bg-muted text-muted-foreground"
      )}
      data-testid="price-change-badge"
    >
      {up ? <TrendingUp className="w-3 h-3" /> : down ? <TrendingDown className="w-3 h-3" /> : <Minus className="w-3 h-3" />}
      {formatPercent(change)}
    </span>
  );
}

const SEVERITY_COLORS = {
  critical: "text-red-600 bg-red-50 border-red-100",
  high: "text-orange-600 bg-orange-50 border-orange-100",
  medium: "text-amber-600 bg-amber-50 border-amber-100",
  low: "text-emerald-600 bg-emerald-50 border-emerald-100",
} as const;

function AiCfoFeed() {
  const { data: insights = [], isLoading } = useGetInsights();
  const top = insights.slice(0, 3);
  const unread = insights.filter((i: { readAt?: string | null }) => !i.readAt).length;

  if (isLoading) return (
    <div className="space-y-2">
      {[1, 2].map((i) => <Skeleton key={i} className="h-16 rounded-xl" />)}
    </div>
  );

  if (insights.length === 0) return (
    <div className="flex flex-col items-center py-8 text-center">
      <Zap className="w-7 h-7 text-muted-foreground/40 mb-2" />
      <p className="text-sm text-muted-foreground">Brak insightów — przejdź do AI CFO, aby wygenerować analizę.</p>
    </div>
  );

  return (
    <div className="space-y-2">
      {top.map((ins: { id: number; severity: string; title: string; body: string; riskScore: number; readAt?: string | null }) => {
        const sev = SEVERITY_COLORS[(ins.severity as keyof typeof SEVERITY_COLORS) ?? "medium"];
        return (
          <div key={ins.id} className={cn("flex items-start gap-3 p-3.5 rounded-xl border", sev)}>
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold leading-snug">{ins.title}</p>
              <p className="text-xs opacity-80 mt-0.5 truncate">{ins.body}</p>
            </div>
            <span className="shrink-0 text-[10px] font-bold opacity-70">{ins.riskScore}</span>
          </div>
        );
      })}
    </div>
  );
}

export default function Dashboard() {
  const { data: summary, isLoading: summaryLoading, isError: summaryError } = useGetDashboardSummary();
  const { data: monthly, isLoading: monthlyLoading, isError: monthlyError } = useGetFoodCostMonthly({ months: 12 });
  const { data: recent, isLoading: recentLoading, isError: recentError } = useGetRecentPurchases({ limit: 8 });
  const { data: activeAlerts } = useGetDashboardActiveAlerts();
  // Fetch a larger pool so per-category tabs actually have items to show
  const { data: topChanges } = useGetTopPriceChanges({ limit: 100, days: 30 });

  const [topChangesCategory, setTopChangesCategory] = useState<string>("wszystkie");
  const [selectedProduct, setSelectedProduct] = useState<{ id: number; name: string } | null>(null);

  // Categorize all returned items
  const categorizedTopChanges = useMemo(() => {
    if (!topChanges) return [];
    return topChanges.map((t) => ({ ...t, category: categorizeProduct(t.productName) }));
  }, [topChanges]);

  // Only show category tabs for categories with at least one entry
  const presentTopCategories = useMemo(() => {
    const ids = new Set(categorizedTopChanges.map((t) => t.category));
    return CATEGORIES.filter((c) => ids.has(c.id));
  }, [categorizedTopChanges]);

  const hasInneTopChanges = categorizedTopChanges.some((t) => t.category === "inne");

  // Filtered + limited to 5 items per tab
  const displayedTopChanges = useMemo(() => {
    const filtered =
      topChangesCategory === "wszystkie"
        ? categorizedTopChanges
        : categorizedTopChanges.filter((t) => t.category === topChangesCategory);
    return filtered.slice(0, 5);
  }, [categorizedTopChanges, topChangesCategory]);

  return (
    <Layout>
      <div className="px-4 py-5 md:px-8 md:py-8">
        <PageHeader
          title="Dashboard"
          subtitle="Przegląd kosztów i zmian cen surowców"
        />

        {/* Error banners — shown per section if a query fails */}
        {(summaryError || monthlyError || recentError) && (
          <div className="mb-6 rounded-xl border border-destructive/30 bg-destructive/5 px-5 py-3 text-sm text-destructive">
            Nie udało się załadować części danych dashboardu. Odśwież stronę lub spróbuj ponownie później.
          </div>
        )}

        {/* Stats grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {summaryLoading ? (
            Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="bg-card border border-border rounded-xl p-6">
                <Skeleton className="w-10 h-10 rounded-lg mb-4" />
                <Skeleton className="h-7 w-28 mb-2" />
                <Skeleton className="h-4 w-36" />
              </div>
            ))
          ) : summary ? (
            <>
              <StatCard
                label="Wydatki w tym miesiącu"
                value={formatPrice(summary.totalSpendThisMonth)}
                change={summary.spendChangePercent}
                icon={FileText}
              />
              <StatCard
                label="Aktywni dostawcy"
                value={String(summary.activeSuppliers)}
                icon={Users}
              />
              <StatCard
                label="Śledzone produkty"
                value={String(summary.trackedProducts)}
                icon={Package}
              />
              <StatCard
                label="Aktywne alerty"
                value={String(summary.activeAlerts)}
                icon={Bell}
              />
            </>
          ) : null}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
          {/* Monthly food cost chart */}
          <div className="lg:col-span-2 bg-card border border-border rounded-xl p-6">
            <h2 className="font-semibold text-foreground mb-1">Food Cost miesięcznie</h2>
            <p className="text-sm text-muted-foreground mb-6">Łączne wydatki na surowce (zł)</p>
            {monthlyLoading ? (
              <Skeleton className="h-48 w-full rounded-lg" />
            ) : monthly && monthly.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={monthly} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px",
                      fontSize: "12px",
                    }}
                    formatter={(value: number) => [formatPrice(value), "Wydatki"]}
                  />
                  <Bar dataKey="totalAmount" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">
                Brak danych. Zaimportuj faktury, aby zobaczyć wykres.
              </div>
            )}
          </div>

          {/* Active alerts */}
          <div className="bg-card border border-border rounded-xl p-6">
            <h2 className="font-semibold text-foreground mb-1">Przekroczone alerty</h2>
            <p className="text-sm text-muted-foreground mb-4">Produkty z przekroczonym progiem</p>
            {activeAlerts && activeAlerts.length > 0 ? (
              <div className="space-y-3">
                {activeAlerts.slice(0, 5).map((alert, i) => (
                  <div key={i} className="flex items-start justify-between gap-2" data-testid={`alert-item-${i}`}>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{alert.productName}</p>
                      <p className="text-xs text-muted-foreground">{alert.supplierName ?? "Wszyscy dostawcy"}</p>
                    </div>
                    <PriceChangeBadge change={alert.changePercent} />
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-sm text-muted-foreground text-center py-8">
                Brak aktywnych alertów
              </div>
            )}
          </div>
        </div>

        {/* AI CFO Feed */}
        <div className="bg-card border border-border rounded-xl p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="font-semibold text-foreground">AI CFO</h2>
              <p className="text-sm text-muted-foreground mt-0.5">Automatyczne insighty cenowe</p>
            </div>
            <Link href="/ai-cfo" className="inline-flex items-center gap-1 text-sm text-primary hover:text-primary/80 transition-colors font-medium">
              Wszystkie <ChevronRight className="w-4 h-4" />
            </Link>
          </div>
          <AiCfoFeed />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Recent purchases */}
          <div className="bg-card border border-border rounded-xl p-6">
            <h2 className="font-semibold text-foreground mb-1">Ostatnie zakupy</h2>
            <p className="text-sm text-muted-foreground mb-4">Porównanie z poprzednią ceną</p>
            {recentLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full rounded-lg" />)}
              </div>
            ) : recent && recent.length > 0 ? (
              <div className="space-y-2">
                {recent.map((item, i) => {
                  const clickable = item.productId != null;
                  return (
                    <div
                      key={i}
                      onClick={() => clickable && setSelectedProduct({ id: item.productId as number, name: item.productName })}
                      className={cn(
                        "flex items-center justify-between py-2 border-b border-border last:border-0 -mx-2 px-2 rounded-lg transition-colors",
                        clickable && "cursor-pointer hover:bg-muted/50"
                      )}
                      data-testid={`purchase-item-${i}`}
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-foreground truncate">{item.productName}</p>
                        <p className="text-xs text-muted-foreground">{item.supplierName} · {formatDate(item.purchaseDate)}</p>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <span className="text-sm font-semibold text-foreground">
                          {formatPrice(item.currentPrice)}/{item.unit}
                        </span>
                        <PriceChangeBadge change={item.changePercent} />
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-sm text-muted-foreground text-center py-8">
                Brak zakupów. Zaimportuj faktury.
              </div>
            )}
          </div>

          {/* Top price changes */}
          <div className="bg-card border border-border rounded-xl p-6">
            <h2 className="font-semibold text-foreground mb-1">Największe zmiany cen</h2>
            <p className="text-sm text-muted-foreground mb-4">Produkty z najwyższą zmianą ceny</p>

            {/* Category tabs */}
            {categorizedTopChanges.length > 0 && (
              <div className="flex items-center gap-1.5 flex-wrap mb-4">
                <button
                  onClick={() => setTopChangesCategory("wszystkie")}
                  className={cn(
                    "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-colors",
                    topChangesCategory === "wszystkie"
                      ? "bg-primary text-primary-foreground"
                      : "bg-secondary/60 text-muted-foreground hover:bg-secondary hover:text-foreground"
                  )}
                >
                  Wszystkie
                  <span className={cn(
                    "text-[10px] px-1.5 py-0.5 rounded-full",
                    topChangesCategory === "wszystkie" ? "bg-white/20" : "bg-muted"
                  )}>
                    {categorizedTopChanges.length}
                  </span>
                </button>
                {presentTopCategories.map((cat) => {
                  const count = categorizedTopChanges.filter((t) => t.category === cat.id).length;
                  return (
                    <button
                      key={cat.id}
                      onClick={() => setTopChangesCategory(cat.id)}
                      className={cn(
                        "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-colors",
                        topChangesCategory === cat.id
                          ? "bg-primary text-primary-foreground"
                          : "bg-secondary/60 text-muted-foreground hover:bg-secondary hover:text-foreground"
                      )}
                    >
                      <span>{cat.emoji}</span>
                      {cat.label}
                      <span className={cn(
                        "text-[10px] px-1.5 py-0.5 rounded-full",
                        topChangesCategory === cat.id ? "bg-white/20" : "bg-muted"
                      )}>
                        {count}
                      </span>
                    </button>
                  );
                })}
                {hasInneTopChanges && (
                  <button
                    onClick={() => setTopChangesCategory("inne")}
                    className={cn(
                      "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-colors",
                      topChangesCategory === "inne"
                        ? "bg-primary text-primary-foreground"
                        : "bg-secondary/60 text-muted-foreground hover:bg-secondary hover:text-foreground"
                    )}
                  >
                    Inne
                    <span className={cn(
                      "text-[10px] px-1.5 py-0.5 rounded-full",
                      topChangesCategory === "inne" ? "bg-white/20" : "bg-muted"
                    )}>
                      {categorizedTopChanges.filter((t) => t.category === "inne").length}
                    </span>
                  </button>
                )}
              </div>
            )}

            {displayedTopChanges.length > 0 ? (
              <div className="space-y-2">
                {displayedTopChanges.map((item, i) => (
                  <div
                    key={i}
                    onClick={() => setSelectedProduct({ id: item.productId, name: item.productName })}
                    className="flex items-center justify-between py-2 border-b border-border last:border-0 -mx-2 px-2 rounded-lg cursor-pointer hover:bg-muted/50 transition-colors"
                    data-testid={`top-change-${i}`}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-foreground truncate">{item.productName}</p>
                      <p className="text-xs text-muted-foreground">{item.supplierName} · {formatDate(item.lastDate)}</p>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <div className="text-right">
                        <p className="text-sm font-semibold text-foreground">{formatPrice(item.currentPrice)}</p>
                        <p className="text-xs text-muted-foreground line-through">{formatPrice(item.previousPrice)}</p>
                      </div>
                      <span
                        className={cn(
                          "text-xs font-medium px-2 py-0.5 rounded-full",
                          item.changeDirection === "up"
                            ? "bg-destructive/10 text-destructive"
                            : "bg-emerald-500/10 text-emerald-600"
                        )}
                      >
                        {item.changeDirection === "up" ? "+" : "-"}{item.changePercent.toFixed(1)}%
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-sm text-muted-foreground text-center py-8">
                Brak wystarczającej historii cen.
              </div>
            )}
          </div>
        </div>
      </div>

      {selectedProduct && (
        <PriceHistoryModal
          productId={selectedProduct.id}
          productName={selectedProduct.name}
          onClose={() => setSelectedProduct(null)}
        />
      )}
    </Layout>
  );
}
