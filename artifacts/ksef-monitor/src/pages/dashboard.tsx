import { useMemo, useState } from "react";
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
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { TrendingUp, TrendingDown, Minus, Users, Package, FileText, Bell, ChevronRight, RefreshCw, Inbox, CheckCircle2, Circle, AlertTriangle, Check } from "lucide-react";
import { Link } from "wouter";
import { formatPrice, formatPercent, formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { CATEGORIES, categorizeProduct } from "@/lib/categories";
import { PriceHistoryModal } from "./products";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { usePeriod, periodToDays, periodToMonths } from "@/hooks/use-period";
import { PeriodSelector } from "@/components/period-selector";

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
        <div className="w-10 h-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center mr-[0px]">
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
      <p className="text-2xl font-bold text-foreground mb-1 text-center">{value}</p>
      <p className="text-sm text-muted-foreground text-center">{label}</p>
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

export default function Dashboard() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { period, setPeriod } = usePeriod();

  // For "month" use calendar-month logic (no days param → backend defaults to 1st of current month).
  // For quarter/year use rolling window so the comparison makes sense.
  const summaryDays = period === "month" ? undefined : periodToDays(period);
  const { data: summary, isLoading: summaryLoading, isError: summaryError } = useGetDashboardSummary({ days: summaryDays });
  const { data: monthly, isLoading: monthlyLoading, isError: monthlyError } = useGetFoodCostMonthly({ months: periodToMonths(period) });
  const { data: recent, isLoading: recentLoading, isError: recentError } = useGetRecentPurchases({ limit: 8, days: periodToDays(period) });
  const { data: activeAlerts } = useGetDashboardActiveAlerts();
  const { data: topChanges } = useGetTopPriceChanges({ limit: 100, days: periodToDays(period) });
  const { data: config } = useGetKsefConfig();
  const { data: pendingList } = useListKsefPending({ status: "pending" });
  const { data: suppliers } = useListSuppliers();
  const sync = useSyncKsefInvoices();

  const hasSuppliers = (suppliers?.length ?? 0) > 0;
  const showOnboarding = !config || !hasSuppliers;

  const pendingCount = pendingList?.length ?? 0;

  function handleSync() {
    if (!config) {
      toast({
        variant: "destructive",
        title: "Brak konfiguracji",
        description: "Przejdź do Ustawień KSeF i wpisz NIP oraz token.",
      });
      return;
    }
    sync.mutate({ data: {} }, {
      onSuccess: (res) => {
        queryClient.invalidateQueries();
        const errs = res.errors && res.errors.length > 0 ? ` Błędów: ${res.errors.length}.` : "";
        toast({
          title: "Synchronizacja zakończona",
          description: `Zaimportowano: ${res.imported}, do przeglądu: ${res.pending}, nieudanych: ${res.failed}.${errs}`,
        });
      },
      onError: (err: unknown) => {
        const e = err as { response?: { data?: { error?: string } }; message?: string };
        toast({
          variant: "destructive",
          title: "Błąd synchronizacji",
          description: e?.response?.data?.error ?? e?.message ?? "Nie udało się zsynchronizować z KSeF.",
        });
      },
    });
  }

  const dismissAlert = useDismissPriceAlert();
  const [dismissedLocally, setDismissedLocally] = useState<Set<string>>(new Set());

  function handleDismiss(alert: {
    alertId: number;
    alertDate: string;
    productName: string;
    supplierName?: string | null;
    currentPrice: number;
    previousPrice: number;
    changePercent: number;
    thresholdPercent: number;
  }) {
    const key = `${alert.alertId}__${alert.alertDate}`;
    setDismissedLocally((prev) => new Set([...prev, key]));
    dismissAlert.mutate(
      {
        id: alert.alertId,
        data: {
          alertDate: alert.alertDate,
          productName: alert.productName,
          supplierName: alert.supplierName ?? null,
          currentPrice: alert.currentPrice,
          previousPrice: alert.previousPrice,
          changePercent: alert.changePercent,
          thresholdPercent: alert.thresholdPercent,
        },
      },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetDashboardActiveAlertsQueryKey() });
          queryClient.invalidateQueries({ queryKey: getGetPriceAlertsHistoryQueryKey() });
        },
        onError: () => {
          setDismissedLocally((prev) => {
            const next = new Set(prev);
            next.delete(key);
            return next;
          });
        },
      }
    );
  }

  const visibleActiveAlerts = (activeAlerts ?? []).filter(
    (a) => !dismissedLocally.has(`${a.alertId}__${a.alertDate}`)
  );

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
          action={
            <div className="flex items-center gap-2">
              <PeriodSelector period={period} onChange={setPeriod} />
              {config ? (
                <Button
                  variant="outline"
                  size="default"
                  onClick={handleSync}
                  disabled={sync.isPending}
                  className="gap-2 shrink-0"
                  data-testid="btn-sync-ksef-dashboard"
                >
                  <RefreshCw className={cn("w-4 h-4", sync.isPending && "animate-spin")} />
                  <span className="hidden sm:inline">
                    {sync.isPending ? "Synchronizuję..." : "Synchronizuj z KSeF"}
                  </span>
                  <span className="sm:hidden">
                    {sync.isPending ? "..." : "Sync"}
                  </span>
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

        {/* Pending invoices banner */}
        {pendingCount > 0 && (
          <div className="mb-6 flex items-center justify-between gap-4 rounded-xl border border-amber-200 bg-amber-50 px-5 py-3.5">
            <div className="flex items-center gap-3">
              <Inbox className="w-4 h-4 shrink-0 text-amber-600" />
              <p className="text-sm font-medium text-amber-800">
                {pendingCount === 1
                  ? "1 FAKTURA DO PRZEGLĄDU"
                  : `${pendingCount} FAKTUR DO PRZEGLĄDU`}
              </p>
            </div>
            <Link href="/pending-invoices">
              <Button size="sm" variant="outline" className="border-amber-300 bg-white text-amber-800 hover:bg-amber-100 hover:border-amber-400 shrink-0">
                <span className="hidden sm:inline">Przejdź do przeglądu</span>
                <span className="sm:hidden">Przejrzyj</span>
              </Button>
            </Link>
          </div>
        )}

        {/* Onboarding card */}
        {showOnboarding && (
          <div className="mb-6 bg-card border border-border rounded-xl p-6">
            <h2 className="font-semibold text-foreground mb-1">Zacznij w 3 krokach</h2>
            <p className="text-sm text-muted-foreground mb-5">Skonfiguruj aplikację, żeby zacząć śledzić ceny surowców.</p>
            <div className="space-y-3">
              {[
                {
                  done: !!config,
                  label: "Wpisz NIP i token KSeF",
                  desc: "Potrzebne do pobierania faktur z KSeF",
                  href: "/settings/ksef",
                  cta: "Przejdź do ustawień",
                },
                {
                  done: hasSuppliers,
                  label: "Zsynchronizuj faktury",
                  desc: "Pobierz faktury i zmapuj dostawców",
                  href: "/invoices",
                  cta: "Przejdź do faktur",
                },
                {
                  done: hasSuppliers,
                  label: "Gotowe — śledź ceny surowców",
                  desc: "Dashboard, alerty cenowe i historia są już aktywne",
                  href: null,
                  cta: null,
                },
              ].map((step, i) => (
                <div key={i} className="flex items-start gap-4">
                  <div className={cn(
                    "w-6 h-6 rounded-full flex items-center justify-center shrink-0 mt-0.5",
                    step.done ? "text-primary" : "text-border"
                  )}>
                    {step.done
                      ? <CheckCircle2 className="w-5 h-5" />
                      : <Circle className="w-5 h-5" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={cn("text-sm font-medium", step.done ? "text-muted-foreground line-through" : "text-foreground")}>
                      {step.label}
                    </p>
                    <p className="text-xs text-muted-foreground">{step.desc}</p>
                  </div>
                  {step.href && !step.done && (
                    <Link href={step.href}>
                      <Button size="sm" variant="outline" className="shrink-0">{step.cta}</Button>
                    </Link>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

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
                label={period === "month" ? "Wydatki w tym miesiącu" : period === "quarter" ? "Wydatki (ostatnie 3 mies.)" : "Wydatki (ostatni rok)"}
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
                label="Śr. zmiana cen"
                value={summary.avgPriceChange != null ? formatPercent(summary.avgPriceChange) : "—"}
                icon={TrendingUp}
              />
            </>
          ) : null}
        </div>

        {/* Triggered alerts inline section — above chart */}
        {visibleActiveAlerts.length > 0 && (
          <div className="mb-6">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-destructive" />
                Przekroczone alerty ({visibleActiveAlerts.length})
              </h2>
              <Link href="/price-alerts">
                <button className="text-xs text-primary hover:underline flex items-center gap-1">
                  Zarządzaj alertami <ChevronRight className="w-3 h-3" />
                </button>
              </Link>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
              {visibleActiveAlerts.map((alert) => (
                <div
                  key={`${alert.alertId}-${alert.alertDate}`}
                  className="bg-destructive/5 border border-destructive/20 rounded-xl p-4"
                  data-testid={`dashboard-triggered-alert-${alert.alertId}`}
                >
                  <div className="flex items-start justify-between mb-2">
                    <p className="font-semibold text-foreground text-sm leading-snug">{alert.productName}</p>
                    <span className={cn(
                      "text-xs font-semibold px-2 py-0.5 rounded-full flex items-center gap-1 ml-2 shrink-0",
                      alert.changePercent >= 0 ? "bg-destructive/10 text-destructive" : "bg-emerald-500/10 text-emerald-600"
                    )}>
                      {alert.changePercent >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                      {formatPercent(alert.changePercent)}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mb-3">
                    {alert.supplierName ?? "Wszyscy dostawcy"} · {formatDate(alert.alertDate)}
                  </p>
                  <div className="flex items-baseline gap-2 text-sm mb-3">
                    <span className="font-semibold text-foreground">{formatPrice(alert.currentPrice)}</span>
                    <span className="text-muted-foreground text-xs">vs</span>
                    <span className="text-muted-foreground line-through text-xs">{formatPrice(alert.previousPrice)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-muted-foreground">Próg: {alert.thresholdPercent}%</p>
                    <button
                      className="text-xs font-medium px-2.5 py-1 rounded-md bg-foreground/8 hover:bg-primary hover:text-primary-foreground transition-colors flex items-center gap-1 border border-border hover:border-primary"
                      onClick={() => handleDismiss(alert)}
                    >
                      <Check className="w-3 h-3" />
                      Sprawdzono
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
          {/* Monthly food cost chart */}
          <div className="lg:col-span-2 bg-card border border-border rounded-xl p-6">
            <h2 className="font-semibold text-foreground mb-1">MIESIĘCZNE WYDATKI</h2>
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
            {visibleActiveAlerts.length > 0 ? (
              <div className="space-y-3">
                {visibleActiveAlerts.slice(0, 5).map((alert, i) => (
                  <div key={i} className="flex items-start justify-between gap-2" data-testid={`alert-item-${i}`}>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-foreground truncate">{alert.productName}</p>
                      <p className="text-xs text-muted-foreground">{alert.supplierName ?? "Wszyscy dostawcy"}</p>
                    </div>
                    <PriceChangeBadge change={alert.changePercent} />
                  </div>
                ))}
                {visibleActiveAlerts.length > 5 && (
                  <Link href="/price-alerts">
                    <p className="text-xs text-primary hover:underline text-center pt-1">
                      +{visibleActiveAlerts.length - 5} więcej
                    </p>
                  </Link>
                )}
              </div>
            ) : (
              <div className="text-sm text-muted-foreground text-center py-8">
                Brak aktywnych alertów
              </div>
            )}
          </div>
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
