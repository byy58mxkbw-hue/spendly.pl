import { useMemo, useState, Component, type ReactNode } from "react";
import { Layout, PageHeader } from "@/components/layout";
import {
  useGetDashboardSummary,
  useGetFoodCostMonthly,
  useGetRecentPurchases,
  useGetDashboardActiveAlerts,
  useGetTopPriceChanges,
  useGetKsefConfig,
  useSyncKsefInvoices,
  useListKsefPending,
  useListSuppliers,
  useDismissPriceAlert,
  getGetDashboardActiveAlertsQueryKey,
  getGetPriceAlertsHistoryQueryKey,
} from "@workspace/api-client-react";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import {
  TrendingUp,
  TrendingDown,
  Minus,
  Users,
  Package,
  FileText,
  Bell,
  ChevronRight,
  RefreshCw,
  Inbox,
  CheckCircle2,
  Circle,
  AlertTriangle,
  Check,
  ArrowUpRight,
  ArrowDownRight,
} from "lucide-react";
import { Link } from "wouter";
import { formatPrice, formatPercent, formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { CATEGORIES, categorizeProduct } from "@/lib/categories";
import { PriceHistoryModal } from "./products";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { currentMonth } from "@/lib/month";
import { MonthNavigator } from "@/components/month-navigator";
import { useCostCenter } from "@/contexts/cost-center-context";

// ─── Mini sparkline ────────────────────────────────────────────────────────────
function Sparkline({ data, positive }: { data: number[]; positive: boolean }) {
  const pts = data.slice(-8).filter((v) => isFinite(v));
  if (pts.length < 2) return null;
  const min = Math.min(...pts);
  const max = Math.max(...pts);
  const range = max - min || 1;
  const W = 56, H = 28;
  const xs = pts.map((_, i) => (i / (pts.length - 1)) * W);
  const ys = pts.map((v) => H - ((v - min) / range) * H);
  const path = pts
    .map((_, i) => `${i === 0 ? "M" : "L"}${xs[i].toFixed(1)},${ys[i].toFixed(1)}`)
    .join(" ");
  const color = positive ? "#22c55e" : "#ef4444";
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} fill="none">
      <path d={path} stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ─── Error Boundary ────────────────────────────────────────────────────────────
class DashboardErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    if (this.state.error) {
      return (
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 text-center px-4">
          <p className="text-lg font-semibold text-foreground">Nie można załadować dashboardu</p>
          <p className="text-sm text-muted-foreground max-w-sm">
            Wystąpił nieoczekiwany błąd. Odśwież stronę, aby spróbować ponownie.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-lg hover:opacity-90 transition-opacity"
          >
            Odśwież stronę
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────
function KpiCard({
  label,
  value,
  subValue,
  change,
  icon: Icon,
  sparkData,
  accent,
}: {
  label: string;
  value: string;
  subValue?: string;
  change?: number | null;
  icon: React.ElementType;
  sparkData?: number[];
  accent?: boolean;
}) {
  const up = (change ?? 0) > 0;
  const down = (change ?? 0) < 0;
  const neutral = !up && !down;

  return (
    <div
      className={cn(
        "relative bg-card border rounded-xl p-4 overflow-hidden transition-shadow hover:shadow-md",
        accent ? "border-primary/30" : "border-border"
      )}
      data-testid="stat-card"
    >
      {accent && (
        <div className="absolute inset-0 bg-primary/3 pointer-events-none" />
      )}
      <div className="relative flex items-start justify-between mb-2">
        <div className={cn(
          "w-8 h-8 rounded-lg flex items-center justify-center",
          accent ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"
        )}>
          <Icon className="w-4 h-4" />
        </div>
        {change != null && (
          <div className={cn(
            "flex items-center gap-0.5 text-[11px] font-semibold px-1.5 py-0.5 rounded-full",
            up && "bg-destructive/10 text-destructive",
            down && "bg-emerald-500/10 text-emerald-600",
            neutral && "bg-muted text-muted-foreground"
          )}>
            {up ? <ArrowUpRight className="w-3 h-3" /> : down ? <ArrowDownRight className="w-3 h-3" /> : <Minus className="w-3 h-3" />}
            {formatPercent(Math.abs(change))}
          </div>
        )}
      </div>

      <div className="relative flex items-end justify-between mt-3">
        <div>
          <p className="text-xl font-bold text-foreground leading-tight tracking-tight">{value}</p>
          {subValue && <p className="text-[11px] text-muted-foreground mt-0.5">{subValue}</p>}
          <p className="text-[11px] font-medium text-muted-foreground mt-1 uppercase tracking-wider">{label}</p>
        </div>
        {sparkData && sparkData.length > 1 && (
          <div className="opacity-70">
            <Sparkline data={sparkData} positive={!up || down} />
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Price change badge ────────────────────────────────────────────────────────
function PriceChangeBadge({ change }: { change: number | null | undefined }) {
  if (change == null) return <span className="text-muted-foreground text-xs">—</span>;
  const up = change > 0;
  const down = change < 0;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 text-[11px] font-semibold px-1.5 py-0.5 rounded-full",
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

// ─── Custom tooltip for area chart ────────────────────────────────────────────
function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ value: number }>; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-card border border-border rounded-lg px-3 py-2 shadow-lg text-xs">
      <p className="text-muted-foreground mb-1 font-medium">{label}</p>
      <p className="text-foreground font-bold">{formatPrice(payload[0]?.value ?? 0)}</p>
    </div>
  );
}

// ─── Main Dashboard ────────────────────────────────────────────────────────────
function DashboardPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [month, setMonth] = useState(() => currentMonth());
  const { selectedId: costCenterId } = useCostCenter();

  const ccParam = costCenterId != null ? { costCenterId } : {};

  const { data: summary, isLoading: summaryLoading, isError: summaryError } = useGetDashboardSummary({ month, ...ccParam });
  const { data: monthly, isLoading: monthlyLoading, isError: monthlyError } = useGetFoodCostMonthly({ months: 12, ...ccParam });
  const { data: recent, isLoading: recentLoading, isError: recentError } = useGetRecentPurchases({ limit: 8, month, ...ccParam });
  const { data: activeAlerts } = useGetDashboardActiveAlerts();
  const { data: topChanges } = useGetTopPriceChanges({ limit: 100, month, ...ccParam });
  const { data: config } = useGetKsefConfig();
  const { data: pendingList } = useListKsefPending({ status: "pending" });
  const { data: suppliers } = useListSuppliers();
  const sync = useSyncKsefInvoices();

  const hasSuppliers = (suppliers?.length ?? 0) > 0;
  const showOnboarding = !config || !hasSuppliers;
  const pendingCount = pendingList?.length ?? 0;

  function handleSync() {
    if (!config) {
      toast({ variant: "destructive", title: "Brak konfiguracji", description: "Przejdź do Ustawień KSeF i wpisz NIP oraz token." });
      return;
    }
    sync.mutate({ data: {} }, {
      onSuccess: (res) => {
        queryClient.invalidateQueries();
        const errs = res.errors && res.errors.length > 0 ? ` Błędów: ${res.errors.length}.` : "";
        toast({ title: "Synchronizacja zakończona", description: `Zaimportowano: ${res.imported}, do przeglądu: ${res.pending}, nieudanych: ${res.failed}.${errs}` });
      },
      onError: (err: unknown) => {
        const e = err as { response?: { data?: { error?: string } }; message?: string };
        toast({ variant: "destructive", title: "Błąd synchronizacji", description: e?.response?.data?.error ?? e?.message ?? "Nie udało się zsynchronizować z KSeF." });
      },
    });
  }

  const dismissAlert = useDismissPriceAlert();
  const [dismissedLocally, setDismissedLocally] = useState<Set<string>>(new Set());

  function handleDismiss(alert: {
    alertId: number; alertDate: string; productName: string; supplierName?: string | null;
    currentPrice: number; previousPrice: number; changePercent: number; thresholdPercent: number;
  }) {
    const key = `${alert.alertId}__${alert.alertDate}`;
    setDismissedLocally((prev) => new Set([...prev, key]));
    dismissAlert.mutate({ id: alert.alertId, data: { alertDate: alert.alertDate, productName: alert.productName, supplierName: alert.supplierName ?? null, currentPrice: alert.currentPrice, previousPrice: alert.previousPrice, changePercent: alert.changePercent, thresholdPercent: alert.thresholdPercent } }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetDashboardActiveAlertsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetPriceAlertsHistoryQueryKey() });
      },
      onError: () => {
        setDismissedLocally((prev) => { const next = new Set(prev); next.delete(key); return next; });
      },
    });
  }

  const visibleActiveAlerts = (activeAlerts ?? []).filter((a) => !dismissedLocally.has(`${a.alertId}__${a.alertDate}`));

  const [topChangesCategory, setTopChangesCategory] = useState<string>("wszystkie");
  const [selectedProduct, setSelectedProduct] = useState<{ id: number; name: string } | null>(null);

  const categorizedTopChanges = useMemo(() => {
    if (!topChanges) return [];
    return topChanges.map((t) => ({ ...t, category: categorizeProduct(t.productName) }));
  }, [topChanges]);

  const presentTopCategories = useMemo(() => {
    const ids = new Set(categorizedTopChanges.map((t) => t.category));
    return CATEGORIES.filter((c) => ids.has(c.id));
  }, [categorizedTopChanges]);

  const hasInneTopChanges = categorizedTopChanges.some((t) => t.category === "inne");

  const displayedTopChanges = useMemo(() => {
    const filtered = topChangesCategory === "wszystkie"
      ? categorizedTopChanges
      : categorizedTopChanges.filter((t) => t.category === topChangesCategory);
    return filtered.slice(0, 6);
  }, [categorizedTopChanges, topChangesCategory]);

  // Sparkline data from monthly chart (last 6 months spend)
  const spendSparkData = useMemo(() => {
    if (!monthly) return [];
    return [...monthly].reverse().slice(-6).map((m) => Number(m.totalAmount) || 0);
  }, [monthly]);

  // Derived chart data — reversed so oldest→newest left→right
  const chartData = useMemo(() => {
    if (!monthly) return [];
    return [...monthly].reverse();
  }, [monthly]);

  // Average monthly spend for reference line
  const avgSpend = useMemo(() => {
    if (!chartData.length) return 0;
    return chartData.reduce((s, m) => s + (Number(m.totalAmount) || 0), 0) / chartData.length;
  }, [chartData]);

  return (
    <Layout>
      <div className="px-4 py-5 md:px-6 md:py-6">
        <PageHeader
          title="Dashboard"
          subtitle="Przegląd kosztów i zmian cen surowców"
          action={
            <div className="flex items-center gap-2">
              <MonthNavigator month={month} onChange={setMonth} />
              {config ? (
                <Button variant="outline" size="default" onClick={handleSync} disabled={sync.isPending} className="gap-2 shrink-0" data-testid="btn-sync-ksef-dashboard">
                  <RefreshCw className={cn("w-4 h-4", sync.isPending && "animate-spin")} />
                  <span className="hidden sm:inline">{sync.isPending ? "Synchronizuję..." : "Synchronizuj z KSeF"}</span>
                  <span className="sm:hidden">{sync.isPending ? "..." : "Sync"}</span>
                </Button>
              ) : (
                <Link href="/settings/ksef">
                  <Button variant="outline" className="gap-2 shrink-0">
                    <RefreshCw className="w-4 h-4" />
                    <span className="hidden sm:inline">Skonfiguruj KSeF</span>
                    <span className="sm:hidden">KSeF</span>
                  </Button>
                </Link>
              )}
            </div>
          }
        />

        {/* Pending invoices — amber sticky alert */}
        {pendingCount > 0 && (
          <div className="mb-4 flex items-center justify-between gap-4 rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-900/50 dark:bg-amber-950/30 px-4 py-2.5">
            <div className="flex items-center gap-2.5">
              <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600" />
              <p className="text-sm font-semibold text-amber-800 dark:text-amber-400">
                {pendingCount === 1 ? "1 faktura wymaga przeglądu" : `${pendingCount} faktur wymaga przeglądu`}
              </p>
            </div>
            <Link href="/pending-invoices">
              <Button size="sm" variant="outline" className="border-amber-300 bg-white text-amber-800 hover:bg-amber-100 shrink-0 h-7 text-xs">
                Przejrzyj <ChevronRight className="w-3 h-3 ml-1" />
              </Button>
            </Link>
          </div>
        )}

        {/* Onboarding */}
        {showOnboarding && (
          <div className="mb-4 bg-card border border-border rounded-xl p-5">
            <h2 className="font-semibold text-foreground mb-0.5">Zacznij w 3 krokach</h2>
            <p className="text-sm text-muted-foreground mb-4">Skonfiguruj aplikację, żeby zacząć śledzić ceny surowców.</p>
            <div className="space-y-2.5">
              {[
                { done: !!config, label: "Skonfiguruj KSeF", desc: "Wpisz NIP i token, aby pobierać faktury automatycznie", href: "/settings/ksef", cta: "Ustawienia" },
                { done: hasSuppliers, label: "Dodaj fakturę lub zsynchronizuj KSeF", desc: "Pobierz z KSeF albo dodaj zakup ręcznie", href: "/invoices", cta: "Faktury" },
                { done: false, label: "Ustaw alerty cenowe", desc: "Monitoruj wzrosty cen kluczowych surowców", href: "/price-alerts", cta: "Alerty" },
              ].map((step, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className={cn("w-5 h-5 flex items-center justify-center shrink-0", step.done ? "text-primary" : "text-border")}>
                    {step.done ? <CheckCircle2 className="w-5 h-5" /> : <Circle className="w-5 h-5" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={cn("text-sm font-medium", step.done ? "text-muted-foreground line-through" : "text-foreground")}>{step.label}</p>
                    <p className="text-xs text-muted-foreground">{step.desc}</p>
                  </div>
                  {step.href && !step.done && (
                    <Link href={step.href}><Button size="sm" variant="outline" className="shrink-0 h-7 text-xs">{step.cta}</Button></Link>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {(summaryError || monthlyError || recentError) && (
          <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-2.5 text-sm text-destructive">
            Nie udało się załadować części danych. Odśwież stronę.
          </div>
        )}

        {/* ── KPI ROW ──────────────────────────────────────────────────────── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
          {summaryLoading ? (
            Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="bg-card border border-border rounded-xl p-4">
                <Skeleton className="w-8 h-8 rounded-lg mb-3" />
                <Skeleton className="h-6 w-24 mb-1" />
                <Skeleton className="h-3 w-32" />
              </div>
            ))
          ) : summary ? (
            <>
              <KpiCard
                label="Wydatki w miesiącu"
                value={formatPrice(summary.totalSpendThisMonth)}
                subValue={summary.spendChangePercent != null
                  ? `${summary.spendChangePercent > 0 ? "+" : ""}${summary.spendChangePercent.toFixed(1)}% vs poprzedni`
                  : undefined}
                change={summary.spendChangePercent}
                icon={FileText}
                sparkData={spendSparkData}
                accent
              />
              <KpiCard
                label="Aktywni dostawcy"
                value={String(summary.activeSuppliers)}
                icon={Users}
              />
              <KpiCard
                label="Śledzone produkty"
                value={String(summary.trackedProducts)}
                icon={Package}
              />
              <KpiCard
                label="Śr. zmiana cen"
                value={summary.avgPriceChange != null ? formatPercent(summary.avgPriceChange) : "—"}
                change={summary.avgPriceChange}
                icon={TrendingUp}
              />
            </>
          ) : null}
        </div>

        {/* ── MAIN LAYOUT: big chart + right sidebar ─────────────────────── */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 mb-4">

          {/* ── BIG ANALYTICS CHART (2/3 width) ── */}
          <div className="xl:col-span-2 bg-card border border-border rounded-xl p-5">
            <div className="flex items-start justify-between mb-1">
              <div>
                <h2 className="text-sm font-semibold text-foreground">Wydatki miesięczne</h2>
                <p className="text-xs text-muted-foreground mt-0.5">Łączne wydatki na surowce — ostatnie 12 miesięcy</p>
              </div>
              {avgSpend > 0 && (
                <div className="text-right shrink-0 ml-4">
                  <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Średnia</p>
                  <p className="text-sm font-bold text-foreground">{formatPrice(avgSpend)}</p>
                </div>
              )}
            </div>

            {monthlyLoading ? (
              <Skeleton className="h-56 w-full rounded-lg mt-4" />
            ) : chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={240}>
                <AreaChart data={chartData} margin={{ top: 8, right: 4, left: -16, bottom: 0 }}>
                  <defs>
                    <linearGradient id="spendGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)}
                  />
                  <Tooltip content={<ChartTooltip />} />
                  {avgSpend > 0 && (
                    <ReferenceLine
                      y={avgSpend}
                      stroke="hsl(var(--muted-foreground))"
                      strokeDasharray="4 4"
                      strokeOpacity={0.5}
                    />
                  )}
                  <Area
                    type="monotone"
                    dataKey="totalAmount"
                    stroke="hsl(var(--primary))"
                    strokeWidth={2}
                    fill="url(#spendGrad)"
                    dot={false}
                    activeDot={{ r: 4, fill: "hsl(var(--primary))", strokeWidth: 0 }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-56 flex items-center justify-center text-muted-foreground text-sm">
                Brak danych. Zaimportuj faktury, aby zobaczyć wykres.
              </div>
            )}
          </div>

          {/* ── RIGHT SIDEBAR ── */}
          <div className="flex flex-col gap-4">
            {/* Active alerts summary */}
            <div className="bg-card border border-border rounded-xl p-4 flex-1">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                  <Bell className="w-3.5 h-3.5 text-primary" />
                  Alerty cenowe
                  {summary?.unreadAlerts ? (
                    <span
                      className="ml-1 inline-flex items-center justify-center rounded-full bg-destructive px-1.5 min-w-[1.25rem] h-5 text-[10px] font-bold text-destructive-foreground"
                      title={`${summary.unreadAlerts} nieprzeczytanych powiadomień`}
                    >
                      {summary.unreadAlerts}
                    </span>
                  ) : null}
                </h2>
                <Link href="/price-alerts">
                  <button className="text-[11px] text-primary hover:underline flex items-center gap-0.5">
                    Wszystkie <ChevronRight className="w-3 h-3" />
                  </button>
                </Link>
              </div>
              {visibleActiveAlerts.length > 0 ? (
                <div className="space-y-2">
                  {visibleActiveAlerts.slice(0, 4).map((alert, i) => (
                    <div key={i} className="flex items-center justify-between gap-2 py-1.5 border-b border-border last:border-0" data-testid={`alert-item-${i}`}>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-semibold text-foreground truncate">{alert.productName}</p>
                        <p className="text-[10px] text-muted-foreground truncate">{alert.supplierName ?? "Wszyscy"}</p>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <PriceChangeBadge change={alert.changePercent} />
                        <button
                          className="w-5 h-5 rounded flex items-center justify-center bg-muted hover:bg-primary hover:text-primary-foreground transition-colors"
                          onClick={() => handleDismiss(alert)}
                          title="Sprawdzono"
                        >
                          <Check className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  ))}
                  {visibleActiveAlerts.length > 4 && (
                    <Link href="/price-alerts">
                      <p className="text-[11px] text-primary hover:underline text-center pt-1">
                        +{visibleActiveAlerts.length - 4} więcej
                      </p>
                    </Link>
                  )}
                </div>
              ) : (
                <div className="text-xs text-muted-foreground text-center py-6 flex flex-col items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                  Brak aktywnych alertów
                </div>
              )}
            </div>

            {/* Top price increases — mini leaderboard */}
            <div className="bg-card border border-border rounded-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                  <TrendingUp className="w-3.5 h-3.5 text-destructive" />
                  Największe wzrosty
                </h2>
                <Link href="/products">
                  <button className="text-[11px] text-primary hover:underline flex items-center gap-0.5">
                    Produkty <ChevronRight className="w-3 h-3" />
                  </button>
                </Link>
              </div>
              {categorizedTopChanges.filter(t => t.changeDirection === "up").slice(0, 4).length > 0 ? (
                <div className="space-y-2">
                  {categorizedTopChanges
                    .filter((t) => t.changeDirection === "up")
                    .slice(0, 4)
                    .map((item, i) => (
                      <div
                        key={i}
                        className="flex items-center justify-between gap-2 py-1 border-b border-border last:border-0 cursor-pointer hover:opacity-80 transition-opacity"
                        onClick={() => setSelectedProduct({ id: item.productId, name: item.productName })}
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-semibold text-foreground truncate">{item.productName}</p>
                          <p className="text-[10px] text-muted-foreground">{item.supplierName}</p>
                        </div>
                        <span className="text-xs font-bold text-destructive shrink-0">
                          +{(item.changePercent ?? 0).toFixed(1)}%
                        </span>
                      </div>
                    ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground text-center py-4">Brak danych</p>
              )}
            </div>
          </div>
        </div>

        {/* ── BOTTOM ROW: recent purchases + top changes ─────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

          {/* Recent purchases */}
          <div className="bg-card border border-border rounded-xl p-5">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h2 className="text-sm font-semibold text-foreground">Ostatnie zakupy</h2>
                <p className="text-xs text-muted-foreground mt-0.5">Porównanie z poprzednią ceną</p>
              </div>
              <Link href="/invoices">
                <button className="text-[11px] text-primary hover:underline flex items-center gap-0.5">
                  Faktury <ChevronRight className="w-3 h-3" />
                </button>
              </Link>
            </div>
            {recentLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-9 w-full rounded" />)}
              </div>
            ) : recent && recent.length > 0 ? (
              <div className="space-y-0">
                {recent.map((item, i) => {
                  const clickable = item.productId != null;
                  return (
                    <div
                      key={i}
                      onClick={() => clickable && setSelectedProduct({ id: item.productId as number, name: item.productName })}
                      className={cn(
                        "flex items-center justify-between py-2 border-b border-border last:border-0 -mx-1 px-1 rounded transition-colors",
                        clickable && "cursor-pointer hover:bg-muted/40"
                      )}
                      data-testid={`purchase-item-${i}`}
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-semibold text-foreground truncate">{item.productName}</p>
                        <p className="text-[10px] text-muted-foreground">{item.supplierName} · {formatDate(item.purchaseDate)}</p>
                      </div>
                      <div className="flex items-center gap-2.5 shrink-0">
                        <span className="text-xs font-bold text-foreground">
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
          <div className="bg-card border border-border rounded-xl p-5">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h2 className="text-sm font-semibold text-foreground">Największe zmiany cen</h2>
                <p className="text-xs text-muted-foreground mt-0.5">Produkty z najwyższą zmianą ceny</p>
              </div>
              <Link href="/products">
                <button className="text-[11px] text-primary hover:underline flex items-center gap-0.5">
                  Produkty <ChevronRight className="w-3 h-3" />
                </button>
              </Link>
            </div>

            {categorizedTopChanges.length > 0 && (
              <div className="flex items-center gap-1 flex-wrap mb-3">
                <button
                  onClick={() => setTopChangesCategory("wszystkie")}
                  className={cn(
                    "px-2 py-0.5 rounded text-[11px] font-medium transition-colors",
                    topChangesCategory === "wszystkie"
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground hover:text-foreground"
                  )}
                >
                  Wszystkie
                </button>
                {presentTopCategories.map((cat) => (
                  <button
                    key={cat.id}
                    onClick={() => setTopChangesCategory(cat.id)}
                    className={cn(
                      "px-2 py-0.5 rounded text-[11px] font-medium transition-colors",
                      topChangesCategory === cat.id
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground hover:text-foreground"
                    )}
                  >
                    {cat.label}
                  </button>
                ))}
                {hasInneTopChanges && (
                  <button
                    onClick={() => setTopChangesCategory("inne")}
                    className={cn(
                      "px-2 py-0.5 rounded text-[11px] font-medium transition-colors",
                      topChangesCategory === "inne"
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground hover:text-foreground"
                    )}
                  >
                    Inne
                  </button>
                )}
              </div>
            )}

            {displayedTopChanges.length > 0 ? (
              <div className="space-y-0">
                {displayedTopChanges.map((item, i) => (
                  <div
                    key={i}
                    onClick={() => setSelectedProduct({ id: item.productId, name: item.productName })}
                    className="flex items-center justify-between py-2 border-b border-border last:border-0 -mx-1 px-1 rounded cursor-pointer hover:bg-muted/40 transition-colors"
                    data-testid={`top-change-${i}`}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold text-foreground truncate">{item.productName}</p>
                      <p className="text-[10px] text-muted-foreground">{item.supplierName} · {formatDate(item.lastDate)}</p>
                    </div>
                    <div className="flex items-center gap-2.5 shrink-0">
                      <div className="text-right">
                        <p className="text-xs font-bold text-foreground">{formatPrice(item.currentPrice)}</p>
                        <p className="text-[10px] text-muted-foreground line-through">{formatPrice(item.previousPrice)}</p>
                      </div>
                      <span className={cn(
                        "text-[11px] font-bold px-1.5 py-0.5 rounded-full",
                        item.changeDirection === "up" ? "bg-destructive/10 text-destructive" : "bg-emerald-500/10 text-emerald-600"
                      )}>
                        {item.changeDirection === "up" ? "+" : "-"}{(item.changePercent ?? 0).toFixed(1)}%
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

export default function Dashboard() {
  return (
    <DashboardErrorBoundary>
      <DashboardPage />
    </DashboardErrorBoundary>
  );
}
