import { useState, useMemo, useEffect } from "react";
import { useAuth } from "@clerk/react";
import { apiUrl } from "@/lib/api-base";
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
import { ErrorState } from "@/components/error-state";
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
  FileSpreadsheet,
  Loader2,
} from "lucide-react";
import { formatPrice } from "@/lib/format";
import { cn } from "@/lib/utils";
import { CATEGORIES } from "@/lib/categories";
import { Link, useLocation } from "wouter";
import { exportToCsv, todaySlug } from "@/lib/export-csv";
import {
  AlertsList, CategoryBarChart, CategoryMiniList, CategoryTrendChart, CostCenterComparisonSection,
  PriceBenchmarkList, ProductsTable, QuantityMoversList, RecommendationsList, SectionCard,
  SpendHero, SpendTrendChart, SupplierCard, TopSuppliersTable, WhyBreakdown, computeImpacts,
  currentMonth, monthLabel, nextMonth, prevMonth, type ProductWithImpact,
} from "./reports/components";

export default function Reports() {
  const [, navigate] = useLocation();
  const { getToken } = useAuth();
  const [exportingXlsx, setExportingXlsx] = useState(false);
  const [month, setMonth] = useState(currentMonth);

  // Pobranie raportu Excel (binarny endpoint poza Orval) — z tokenem Clerk,
  // bo apka woła API na innej domenie niż front. Grupowanie per centrum kosztów
  // + porównanie do poprzedniego miesiąca liczy backend.
  async function handleExportXlsx() {
    if (exportingXlsx) return;
    setExportingXlsx(true);
    try {
      const token = await getToken();
      const res = await fetch(
        apiUrl(`/api/reports/products-by-cost-center.xlsx?month=${month}`),
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `raport-zakupy-${month}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Eksport Excel nie powiódł się:", err);
    } finally {
      setExportingXlsx(false);
    }
  }
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

  const { data, isLoading, isError: monthlyError, refetch: refetchMonthly } = useGetMonthlyReport(
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
            <Button
              variant="outline"
              size="sm"
              onClick={handleExportXlsx}
              disabled={exportingXlsx}
              title="Zakupy per centrum kosztów, z porównaniem do poprzedniego miesiąca"
              className="gap-1.5 text-xs hidden md:flex"
            >
              {exportingXlsx ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <FileSpreadsheet className="w-3.5 h-3.5" />
              )}
              Eksport Excel
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

        {monthlyError && (
          <ErrorState
            onRetry={() => refetchMonthly()}
            message="Nie udało się pobrać raportu miesięcznego. Spróbuj ponownie."
            className="glass rounded-xl mb-5"
          />
        )}

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
              <div className="glass rounded-xl py-20 text-center px-4">
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
              <div className="glass rounded-xl overflow-hidden">
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
              <div className="glass rounded-xl py-20 text-center px-4">
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
              <div className="glass rounded-xl py-20 text-center px-4">
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
