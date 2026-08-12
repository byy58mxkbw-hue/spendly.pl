import { useMemo, useState, useEffect, Component, Suspense, lazy, type ReactNode } from "react";
import { useClerk } from "@clerk/react";
import { apiUrl } from "@/lib/api-base";
import { Layout, PageHeader } from "@/components/layout";
import {
  useGetDashboardSummary,
  useGetFoodCostMonthly,
  useGetRecentPurchases,
  useGetDashboardActiveAlerts,
  useGetTopPriceChanges,
  useGetKsefConfig,
  useListKsefPending,
  useListSuppliers,
  useListPriceAlerts,
  useDismissPriceAlert,
  getGetDashboardActiveAlertsQueryKey,
  getGetPriceAlertsHistoryQueryKey,
} from "@workspace/api-client-react";
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
  Percent,
  CheckCircle2,
  Circle,
  AlertTriangle,
  Check,
  ArrowUpRight,
  ArrowDownRight,
} from "@/lib/icons";
import { Link } from "wouter";
import { formatPrice, formatPercent, formatDate } from "@/lib/format";

// Wykres (recharts) ładowany leniwie — nie blokuje pierwszego renderu dashboardu.
const SpendAreaChart = lazy(() => import("./dashboard/spend-area-chart"));
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { CATEGORIES, categorizeProduct } from "@/lib/categories";
import { PriceHistoryModal } from "./products";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { currentMonth } from "@/lib/month";
import { MonthNavigator } from "@/components/month-navigator";
import { useFoodCostRatio } from "@/hooks/use-food-cost-ratio";
import { useCostCenter } from "@/contexts/cost-center-context";
import { WelcomeOnboarding } from "@/components/welcome-onboarding";
import { useSyncKsefProgress, syncPhaseProgress, describeSyncResult, type SyncPhase } from "@/hooks/use-sync-progress";
import { Progress } from "@/components/ui/progress";

function syncPhaseLabel(phase: SyncPhase): string {
  switch (phase.type) {
    case "connecting": return "Łączę...";
    case "scanning": return `Skanuję ${phase.windowsDone}/${phase.windowsTotal}`;
    case "fetching": return phase.total > 0 ? `Pobieram ${phase.fetched}/${phase.total}` : "Pobieram...";
    default: return "Synchronizuję...";
  }
}

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
  // Semantyka kosztowa: taniej = oliwka, drożej = terakota (tokeny motywu).
  const color = positive ? "hsl(var(--positive))" : "hsl(var(--negative))";
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} fill="none">
      <path d={path} stroke={color} strokeWidth="1.25" strokeLinecap="square" strokeLinejoin="miter" />
    </svg>
  );
}

// ─── Nagłówek sekcji (wersaliki + linia) ──────────────────────────────────────
function SectionHead({
  label,
  note,
  icon: Icon,
  href,
  hrefLabel,
  badge,
}: {
  label: string;
  note?: string;
  icon?: React.ElementType;
  href?: string;
  hrefLabel?: string;
  badge?: ReactNode;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 pb-2 mb-3 border-b border-border">
      <div className="min-w-0">
        <h2 className="label-caps flex items-center gap-1.5 text-foreground">
          {Icon && <Icon className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />}
          {label}
          {badge}
        </h2>
        {note && <p className="text-xs text-muted-foreground mt-1">{note}</p>}
      </div>
      {href && (
        <Link href={href}>
          <button className="text-[11px] text-primary hover:underline underline-offset-2 flex items-center gap-0.5 shrink-0">
            {hrefLabel} <ChevronRight className="w-3 h-3" />
          </button>
        </Link>
      )}
    </div>
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
  hero,
  className,
}: {
  label: string;
  value: string;
  subValue?: string;
  change?: number | null;
  icon: React.ElementType;
  sparkData?: number[];
  accent?: boolean;
  hero?: boolean;
  className?: string;
}) {
  // W apce o KOSZTACH wzrost jest zły: idzie terakotą, spadek oliwką.
  const up = (change ?? 0) > 0;
  const down = (change ?? 0) < 0;

  return (
    <div
      className={cn(
        "relative bg-card p-4 flex flex-col",
        // Wyróżnienie = grubsza górna linia, nie cień ani tło.
        accent && "card-emphasis",
        className,
      )}
      data-testid="stat-card"
    >
      <p className="label-caps flex items-center gap-1.5">
        <Icon className="w-3.5 h-3.5 shrink-0 opacity-70" />
        <span className="truncate">{label}</span>
      </p>

      <div className="flex items-end justify-between gap-2 mt-3">
        <p className={cn("num-lg text-foreground", hero ? "text-[2.1rem]" : "text-2xl")}>{value}</p>
        {sparkData && sparkData.length > 1 && (
          <div className="shrink-0 pb-1 opacity-80">
            <Sparkline data={sparkData} positive={!up || down} />
          </div>
        )}
      </div>

      {(change != null || subValue) && (
        <p className="text-[11px] mt-1.5 flex items-center gap-1 text-muted-foreground">
          {change != null && (
            <span
              className={cn(
                "inline-flex items-center gap-0.5 font-semibold",
                up && "text-negative",
                down && "text-positive",
              )}
            >
              {up ? <ArrowUpRight className="w-3 h-3" /> : down ? <ArrowDownRight className="w-3 h-3" /> : <Minus className="w-3 h-3" />}
              {/* Kierunek niesie strzałka, więc liczba idzie bez znaku — inaczej
                  wychodziło „↓ −12,4% mniej niż…" (podwójne zaprzeczenie). */}
              <span className="num">{Math.abs(change).toFixed(1)}%</span>
            </span>
          )}
          {subValue && <span className="truncate">{subValue}</span>}
        </p>
      )}
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
        "inline-flex items-center gap-0.5 text-[11px] font-semibold tabular-nums",
        up && "text-negative",
        down && "text-positive",
        !up && !down && "text-muted-foreground",
      )}
      data-testid="price-change-badge"
    >
      {up ? <TrendingUp className="w-3 h-3" /> : down ? <TrendingDown className="w-3 h-3" /> : <Minus className="w-3 h-3" />}
      {formatPercent(change)}
    </span>
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
  const { data: priceAlerts } = useListPriceAlerts();
  const { phase: syncPhase, startSync, isPending: syncPending } = useSyncKsefProgress();

  const hasSuppliers = (suppliers?.length ?? 0) > 0;
  const hasAlerts = (priceAlerts?.length ?? 0) > 0;
  // Checklist aktywacji: widoczna aż WSZYSTKIE 3 kroki gotowe (nie znika po 1.
  // fakturze), z możliwością ukrycia. Kroki odhaczają się wg realnego stanu.
  const onbSteps = [!!config, hasSuppliers, hasAlerts];
  const onbDone = onbSteps.filter(Boolean).length;
  const [onbHidden, setOnbHidden] = useState<boolean>(() => {
    try { return localStorage.getItem("spendly_onboarding_hidden") === "1"; } catch { return false; }
  });
  const hideOnboarding = () => {
    setOnbHidden(true);
    try { localStorage.setItem("spendly_onboarding_hidden", "1"); } catch { /* ignore */ }
  };
  const showOnboarding = onbDone < 3 && !onbHidden;
  const pendingCount = pendingList?.length ?? 0;

  // Realny food cost % (koszt z KSeF ÷ przychód z GoPOS/ręczny). Widoczny tylko gdy
  // jest przychód (foodCostPct != null) — więc sam się chowa dla lokali bez sprzedaży.
  const { data: foodCost } = useFoodCostRatio({ month });
  const foodCostDelta = foodCost?.foodCostPct != null && foodCost.prevFoodCostPct != null ? foodCost.foodCostPct - foodCost.prevFoodCostPct : null;

  async function handleSync() {
    if (!config) {
      toast({ variant: "destructive", title: "Brak konfiguracji", description: "Przejdź do Ustawień KSeF i wpisz NIP oraz token." });
      return;
    }
    try {
      const res = await startSync();
      queryClient.invalidateQueries();
      toast(describeSyncResult(res));
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Nie udało się zsynchronizować z KSeF.";
      toast({ variant: "destructive", title: "Błąd synchronizacji", description: msg });
    }
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

  // Dynamiczna etykieta — pokaż tylko tyle miesięcy ile jest danych (nie mylące „12 miesięcy")
  const monthsLabel = useMemo(() => {
    const n = chartData.length;
    const rem10 = n % 10;
    const rem100 = n % 100;
    const word = n === 1 ? "miesiąc" : rem10 >= 2 && rem10 <= 4 && !(rem100 >= 12 && rem100 <= 14) ? "miesiące" : "miesięcy";
    return `ostatnie ${n} ${word}`;
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
                <div className="flex flex-col items-stretch gap-1 shrink-0">
                  <Button variant="outline" size="default" onClick={handleSync} disabled={syncPending} className="gap-2 shrink-0" data-testid="btn-sync-ksef-dashboard">
                    <RefreshCw className={cn("w-4 h-4", syncPending && "animate-spin")} />
                    <span className="hidden sm:inline">{syncPending ? syncPhaseLabel(syncPhase) : "Synchronizuj z KSeF"}</span>
                    <span className="sm:hidden">{syncPending ? syncPhaseLabel(syncPhase) : "Sync"}</span>
                  </Button>
                  {syncPending && <Progress value={syncPhaseProgress(syncPhase) ?? 0} className="h-0.5 w-full" />}
                </div>
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
          <div className="mb-4 flex items-center justify-between gap-4 border-y border-warning/40 bg-warning/[0.07] px-4 py-2.5">
            <div className="flex items-center gap-2.5">
              <AlertTriangle className="w-4 h-4 shrink-0 text-warning" />
              <p className="text-sm font-semibold text-foreground">
                {pendingCount === 1 ? "1 faktura wymaga przeglądu" : `${pendingCount} faktur wymaga przeglądu`}
              </p>
            </div>
            <Link href="/pending-invoices">
              <Button size="sm" variant="outline" className="shrink-0 h-7 text-xs">
                Przejrzyj <ChevronRight className="w-3 h-3 ml-1" />
              </Button>
            </Link>
          </div>
        )}

        {/* Powitalny samouczek — raz dla nowego użytkownika */}
        <WelcomeOnboarding ready={suppliers !== undefined} hasData={!!config || hasSuppliers} />

        {/* Onboarding — checklist aktywacji z realnym postępem */}
        {showOnboarding && (
          <div className="mb-4 glass p-5">
            <div className="flex items-start justify-between gap-3 mb-1">
              <h2 className="head-display text-lg text-foreground">Zacznij w 3 krokach</h2>
              <button
                className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2 shrink-0"
                onClick={hideOnboarding}
              >
                Ukryj
              </button>
            </div>
            <p className="text-sm text-muted-foreground mb-3">Skonfiguruj aplikację, żeby zacząć śledzić ceny surowców.</p>
            {/* Pasek postępu */}
            <div className="flex items-center gap-2 mb-4">
              <div className="flex-1 h-1 bg-border overflow-hidden">
                <div className="h-full bg-primary transition-all" style={{ width: `${(onbDone / 3) * 100}%` }} />
              </div>
              <span className="text-xs font-medium text-muted-foreground shrink-0 num">{onbDone} z 3</span>
            </div>
            <div className="space-y-2.5">
              {[
                { done: !!config, label: "Skonfiguruj KSeF", desc: "Wpisz NIP i token, aby pobierać faktury automatycznie", href: "/settings/ksef", cta: "Ustawienia" },
                { done: hasSuppliers, label: "Dodaj fakturę lub zsynchronizuj KSeF", desc: "Pobierz z KSeF albo dodaj zakup ręcznie", href: "/invoices", cta: "Faktury" },
                { done: hasAlerts, label: "Ustaw alerty cenowe", desc: "Monitoruj wzrosty cen kluczowych surowców", href: "/price-alerts", cta: "Alerty" },
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
          <div className="mb-4 border-y border-destructive/40 bg-destructive/[0.06] px-4 py-2.5 text-sm text-destructive">
            Nie udało się załadować części danych. Odśwież stronę.
          </div>
        )}

        {/* ── KPI ROW ──────────────────────────────────────────────────────── */}
        {/* Jeden blok „tabeli redakcyjnej": komórki rozdzielone hairline'em
            (gap-px na tle border), zamiast siatki osobnych zaokrąglonych kart. */}
        <div className="grid grid-cols-3 lg:grid-cols-4 gap-px bg-border border border-border mb-4">
          {summaryLoading ? (
            Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className={cn("bg-card p-4", i === 0 && "col-span-3 lg:col-span-1")}>
                <Skeleton className="h-3 w-24 mb-4" />
                <Skeleton className="h-7 w-32 mb-2" />
                <Skeleton className="h-3 w-28" />
              </div>
            ))
          ) : summary ? (
            <>
              {/* Duży kafel wydatków — pełna szerokość na mobile (hero), 1 kolumna na desktop */}
              <KpiCard
                label="Wydatki w miesiącu"
                value={formatPrice(summary.totalSpendThisMonth)}
                subValue={summary.spendChangePercent != null
                  ? `${summary.spendChangePercent > 0 ? "więcej" : "mniej"} niż ${month === currentMonth() ? "w tym samym okresie poprzedniego miesiąca" : "miesiąc wcześniej"}`
                  : undefined}
                change={summary.spendChangePercent}
                icon={FileText}
                sparkData={spendSparkData}
                accent
                hero
                className="col-span-3 lg:col-span-1"
              />
              <KpiCard
                label="Aktywni dostawcy"
                value={String(summary.activeSuppliers)}
                icon={Users}
              />
              <KpiCard
                label="Produkty łącznie"
                value={String(summary.trackedProducts)}
                icon={Package}
              />
              <KpiCard
                label="Śr. zmiana cen"
                value={summary.avgPriceChange != null ? formatPercent(summary.avgPriceChange) : "—"}
                change={summary.avgPriceChange}
                icon={TrendingUp}
              />
              {foodCost?.foodCostPct != null && (
                <KpiCard
                  label="Food cost %"
                  value={`${foodCost.foodCostPct.toFixed(1)}%`}
                  subValue={foodCostDelta != null ? `${foodCostDelta >= 0 ? "+" : ""}${foodCostDelta.toFixed(1)} p.p. vs poprz.` : "koszt z KSeF ÷ sprzedaż"}
                  change={foodCostDelta}
                  icon={Percent}
                />
              )}
            </>
          ) : null}
        </div>

        {/* ── MAIN LAYOUT: big chart + right sidebar ─────────────────────── */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 mb-4">

          {/* ── BIG ANALYTICS CHART (2/3 width) ── */}
          <div className="xl:col-span-2 glass p-5">
            <div className="flex items-baseline justify-between gap-3 pb-2 mb-3 border-b border-border">
              <div className="min-w-0">
                <h2 className="label-caps text-foreground">Wydatki miesięczne</h2>
                <p className="text-xs text-muted-foreground mt-1">Łączne wydatki na surowce — {monthsLabel}</p>
              </div>
              {avgSpend > 0 && (
                <div className="text-right shrink-0">
                  <p className="label-caps">Średnia</p>
                  <p className="num text-base font-semibold text-foreground mt-0.5">{formatPrice(avgSpend)}</p>
                </div>
              )}
            </div>

            {monthlyLoading ? (
              <Skeleton className="h-56 w-full mt-4" />
            ) : chartData.length > 0 ? (
              <Suspense fallback={<Skeleton className="h-[240px] w-full mt-4" />}>
                <SpendAreaChart chartData={chartData} avgSpend={avgSpend} />
              </Suspense>
            ) : (
              <div className="h-56 flex items-center justify-center text-muted-foreground text-sm">
                Brak danych. Zaimportuj faktury, aby zobaczyć wykres.
              </div>
            )}
          </div>

          {/* ── RIGHT SIDEBAR ── */}
          <div className="flex flex-col gap-4">
            {/* Active alerts summary */}
            <div className="glass p-4 flex-1">
              <SectionHead
                label="Alerty cenowe"
                icon={Bell}
                href="/price-alerts"
                hrefLabel="Wszystkie"
                badge={visibleActiveAlerts.length > 0 ? (
                  <span
                    className="ml-1 inline-flex items-center justify-center bg-destructive px-1.5 min-w-[1.1rem] h-4 text-[10px] font-bold tabular-nums text-destructive-foreground"
                    title={`${visibleActiveAlerts.length} aktywnych alertów`}
                  >
                    {visibleActiveAlerts.length}
                  </span>
                ) : undefined}
              />
              {visibleActiveAlerts.length > 0 ? (
                <div className="rule-list">
                  {visibleActiveAlerts.slice(0, 4).map((alert, i) => (
                    <div key={i} className="flex items-center justify-between gap-2 py-2" data-testid={`alert-item-${i}`}>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-semibold text-foreground truncate">{alert.productName}</p>
                        <p className="text-[10px] text-muted-foreground truncate">{alert.supplierName ?? "Wszyscy"}</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <PriceChangeBadge change={alert.changePercent} />
                        <button
                          className="w-5 h-5 flex items-center justify-center border border-border text-muted-foreground hover:bg-primary hover:text-primary-foreground hover:border-primary transition-colors"
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
                      <p className="text-[11px] text-primary hover:underline underline-offset-2 pt-2">
                        +{visibleActiveAlerts.length - 4} więcej
                      </p>
                    </Link>
                  )}
                </div>
              ) : (
                <div className="text-xs text-muted-foreground text-center py-6 flex flex-col items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-positive" />
                  Brak aktywnych alertów
                </div>
              )}
            </div>

            {/* Top price increases — mini leaderboard */}
            <div className="glass p-4">
              <SectionHead label="Największe wzrosty" icon={TrendingUp} href="/products" hrefLabel="Produkty" />
              {categorizedTopChanges.filter(t => t.changeDirection === "up").slice(0, 4).length > 0 ? (
                <div className="rule-list">
                  {categorizedTopChanges
                    .filter((t) => t.changeDirection === "up")
                    .slice(0, 4)
                    .map((item, i) => (
                      <div
                        key={i}
                        className="flex items-center justify-between gap-2 py-2 cursor-pointer hover:bg-muted/40 transition-colors"
                        onClick={() => setSelectedProduct({ id: item.productId, name: item.productName })}
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-semibold text-foreground truncate">{item.productName}</p>
                          <p className="text-[10px] text-muted-foreground">{item.supplierName}</p>
                        </div>
                        <span className="num text-sm font-semibold text-negative shrink-0">
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
          <div className="glass p-5">
            <SectionHead
              label="Ostatnie zakupy"
              note="Porównanie z poprzednią ceną"
              href="/invoices"
              hrefLabel="Faktury"
            />
            {recentLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-9 w-full" />)}
              </div>
            ) : recent && recent.length > 0 ? (
              <div className="rule-list">
                {recent.map((item, i) => {
                  const clickable = item.productId != null;
                  return (
                    <div
                      key={i}
                      onClick={() => clickable && setSelectedProduct({ id: item.productId as number, name: item.productName })}
                      className={cn(
                        "flex items-center justify-between py-2 -mx-1 px-1 transition-colors",
                        clickable && "cursor-pointer hover:bg-muted/40"
                      )}
                      data-testid={`purchase-item-${i}`}
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-semibold text-foreground truncate">{item.productName}</p>
                        <p className="text-[10px] text-muted-foreground">{item.supplierName} · {formatDate(item.purchaseDate)}</p>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <span className="num text-sm font-semibold text-foreground">
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
          <div className="glass p-5">
            <SectionHead
              label="Największe zmiany cen"
              note="Produkty z najwyższą zmianą ceny"
              href="/products"
              hrefLabel="Produkty"
            />

            {categorizedTopChanges.length > 0 && (
              <div className="flex items-center gap-1 flex-wrap mb-3">
                <button
                  onClick={() => setTopChangesCategory("wszystkie")}
                  className={cn(
                    "px-2 py-0.5 rounded text-[11px] font-medium transition-colors",
                    topChangesCategory === "wszystkie"
                      ? "bg-primary border-primary text-primary-foreground"
                      : "border-border text-muted-foreground hover:text-foreground hover:border-foreground/40"
                  )}
                >
                  Wszystkie
                </button>
                {presentTopCategories.map((cat) => (
                  <button
                    key={cat.id}
                    onClick={() => setTopChangesCategory(cat.id)}
                    className={cn(
                      "px-2 py-0.5 border text-[11px] font-medium transition-colors",
                      topChangesCategory === cat.id
                        ? "bg-primary border-primary text-primary-foreground"
                        : "border-border text-muted-foreground hover:text-foreground hover:border-foreground/40"
                    )}
                  >
                    {cat.label}
                  </button>
                ))}
                {hasInneTopChanges && (
                  <button
                    onClick={() => setTopChangesCategory("inne")}
                    className={cn(
                      "px-2 py-0.5 border text-[11px] font-medium transition-colors",
                      topChangesCategory === "inne"
                        ? "bg-primary border-primary text-primary-foreground"
                        : "border-border text-muted-foreground hover:text-foreground hover:border-foreground/40"
                    )}
                  >
                    Inne
                  </button>
                )}
              </div>
            )}

            {displayedTopChanges.length > 0 ? (
              <div className="rule-list">
                {displayedTopChanges.map((item, i) => (
                  <div
                    key={i}
                    onClick={() => setSelectedProduct({ id: item.productId, name: item.productName })}
                    className="flex items-center justify-between py-2 -mx-1 px-1 cursor-pointer hover:bg-muted/40 transition-colors"
                    data-testid={`top-change-${i}`}
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold text-foreground truncate">{item.productName}</p>
                      <p className="text-[10px] text-muted-foreground">{item.supplierName} · {formatDate(item.lastDate)}</p>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <div className="text-right">
                        <p className="num text-sm font-semibold text-foreground">{formatPrice(item.currentPrice)}</p>
                        <p className="num text-[10px] text-muted-foreground line-through">{formatPrice(item.previousPrice)}</p>
                      </div>
                      <span className={cn(
                        "num text-sm font-semibold w-14 text-right",
                        item.changeDirection === "up" ? "text-negative" : "text-positive",
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
