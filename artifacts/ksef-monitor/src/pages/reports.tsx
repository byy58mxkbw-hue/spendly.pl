import { useState, useMemo, useEffect, lazy, Suspense } from "react";
import { useAuth } from "@clerk/react";
import { apiUrl } from "@/lib/api-base";
import { useToast } from "@/hooks/use-toast";
import { Layout, PageHeader } from "@/components/layout";
import {
  useGetMonthlyReport,
  useGetCategorySpendTrend,
  useGetSpendBridge,
} from "@workspace/api-client-react";
import type { ReportProductRow, ReportSupplierRow, SpendBridge } from "@workspace/api-client-react";
import { useCostCenter } from "@/contexts/cost-center-context";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/error-state";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  FileText,
  Package,
  Users,
  Download,
  FileSpreadsheet,
  Loader2,
} from "lucide-react";
import { formatPrice } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Link, useLocation } from "wouter";
import { exportToCsv, todaySlug } from "@/lib/export-csv";
import {
  AlertsList, CategoryMiniList, CostCenterComparisonSection,
  PriceBenchmarkList, ProductsTable, QuantityMoversList, RecommendationsList, SectionCard,
  SpendHero, SupplierCard, TopSuppliersTable, WhyBreakdown, computeImpacts,
  currentMonth, type ProductWithImpact,
} from "./reports/components";
import { PeriodProvider, usePeriod, type PresetKey } from "@/contexts/period-context";

// Wykresy (recharts ~110KB gzip) w osobnym chunku, ładowane leniwie — reszta Raportów
// (KPI, tabele, listy) renderuje się bez czekania na recharts.
const SpendTrendChart = lazy(() => import("./reports/charts").then((m) => ({ default: m.SpendTrendChart })));
const CategoryBarChart = lazy(() => import("./reports/charts").then((m) => ({ default: m.CategoryBarChart })));
const CategoryTrendChart = lazy(() => import("./reports/charts").then((m) => ({ default: m.CategoryTrendChart })));

// Selektor okresu: presety + własny zakres dni (input type=date, precyzja dzienna).
function PeriodSelector() {
  const { period, preset, setPreset, setCustom } = usePeriod();
  const presets: [PresetKey, string][] = [
    ["this-month", "Miesiąc"], ["last-3m", "3 mies"], ["last-6m", "6 mies"], ["year", "Rok"],
  ];
  return (
    <div className="flex items-center gap-1 flex-wrap justify-end">
      {presets.map(([k, lbl]) => (
        <button
          key={k}
          onClick={() => setPreset(k)}
          className={cn(
            "px-2.5 py-1 text-xs rounded-md border transition-colors",
            preset === k
              ? "bg-primary text-primary-foreground border-primary"
              : "border-border text-muted-foreground hover:bg-secondary/50",
          )}
        >
          {lbl}
        </button>
      ))}
      <div
        className={cn(
          "flex items-center gap-1 px-1.5 py-0.5 rounded-md border bg-card",
          preset === "custom" ? "border-primary" : "border-border",
        )}
        title="Własny zakres dat"
      >
        <input
          type="date" value={period.from} max={period.to}
          onChange={(e) => e.target.value && setCustom(e.target.value, period.to)}
          className="text-xs bg-transparent text-foreground w-[120px] outline-none"
        />
        <span className="text-xs text-muted-foreground">–</span>
        <input
          type="date" value={period.to} min={period.from}
          onChange={(e) => e.target.value && setCustom(period.from, e.target.value)}
          className="text-xs bg-transparent text-foreground w-[120px] outline-none"
        />
      </div>
    </div>
  );
}

export default function Reports() {
  return (
    <PeriodProvider>
      <ReportsInner />
    </PeriodProvider>
  );
}

function ReportsInner() {
  const [, navigate] = useLocation();
  const { getToken } = useAuth();
  const { toast } = useToast();
  const { period, prev, label, prevLabel, preset, setCustom } = usePeriod();
  const [exportingXlsx, setExportingXlsx] = useState(false);

  // Pobranie raportu Excel (binarny endpoint poza Orval) — z tokenem Clerk,
  // bo apka woła API na innej domenie niż front. Grupowanie per centrum kosztów
  // + porównanie do poprzedniego miesiąca liczy backend. Błędy pokazujemy toastem
  // (bez tego pobranie padało po cichu). Link dodajemy do DOM przed .click() —
  // część przeglądarek ignoruje kliknięcie na anchorze spoza drzewa dokumentu.
  async function handleExportXlsx() {
    if (exportingXlsx) return;
    setExportingXlsx(true);
    try {
      const token = await getToken();
      // Gdy wybrane konkretne centrum kosztów → raport zawężony do niego,
      // rozbity per dostawca. Bez wyboru → ogólny raport wg centrów kosztów.
      const ccQuery = costCenterId != null ? `&costCenterId=${costCenterId}` : "";
      const res = await fetch(
        apiUrl(`/api/reports/products-by-cost-center.xlsx?from=${period.from}&to=${period.to}${ccQuery}`),
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new Error(`HTTP ${res.status}${body ? ` — ${body.slice(0, 120)}` : ""}`);
      }
      const blob = await res.blob();
      if (blob.size === 0) throw new Error("Pusty plik z serwera");
      const fname = `raport-zakupy-${period.from}_${period.to}.xlsx`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fname;
      a.style.display = "none";
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast({ title: "Pobrano raport Excel", description: fname });
    } catch (err) {
      console.error("Eksport Excel nie powiódł się:", err);
      toast({
        variant: "destructive",
        title: "Nie udało się pobrać raportu Excel",
        description: err instanceof Error ? err.message : "Nieznany błąd",
      });
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
    setAutoMonthDone(true);
    // Tylko przy domyślnym „ten miesiąc" — ustaw okres na miesiąc z największymi zakupami
    // (świeżo zaimportowane faktury bywają z poprzedniego miesiąca → pusty bieżący).
    if (preset !== "this-month") return;
    const spendByMonth = new Map<string, number>();
    for (const r of trendForDefault) {
      spendByMonth.set(r.month, (spendByMonth.get(r.month) ?? 0) + (r.totalSpend ?? 0));
    }
    let best: string | null = null;
    let bestSpend = 0;
    for (const [m, s] of spendByMonth) {
      if (s > bestSpend) { bestSpend = s; best = m; }
    }
    if (best && best !== currentMonth()) {
      const [by, bm] = best.split("-").map(Number);
      const last = new Date(by, bm, 0).getDate();
      setCustom(`${best}-01`, `${best}-${String(last).padStart(2, "0")}`);
    }
  }, [trendForDefault, autoMonthDone, preset]);
  const [tab, setTab] = useState("podsumowanie");
  const [trendMonths, setTrendMonths] = useState(6);
  const { selectedId: costCenterId } = useCostCenter();
  const ccParam = costCenterId != null ? { costCenterId } : {};

  const { data, isLoading, isError: monthlyError, refetch: refetchMonthly } = useGetMonthlyReport(
    { from: period.from, to: period.to, ...ccParam },
    { query: { queryKey: ["monthly-report", period.from, period.to, costCenterId] } },
  );
  const { data: prevData } = useGetMonthlyReport(
    { from: prev.from, to: prev.to, ...ccParam },
    { query: { queryKey: ["monthly-report", prev.from, prev.to, costCenterId] } },
  );
  const { data: bridge } = useGetSpendBridge(
    { from: period.from, to: period.to, ...ccParam },
    { query: { queryKey: ["spend-bridge", period.from, period.to, costCenterId] } },
  );

  const allProducts = useMemo<ProductWithImpact[]>(() => {
    if (!data) return [];
    return computeImpacts(data.topProducts);
  }, [data]);

  const prevMonthTotalSpend = prevData?.totalSpend ?? 0;

  return (
    <Layout>
      <div className="max-w-5xl mx-auto px-4 md:px-6 py-5 md:py-7">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center gap-3 mb-5 md:mb-6">
          <div className="flex-1 min-w-0">
            <PageHeader title="Raporty" />
            <p className="text-xs text-muted-foreground mt-0.5">
              Analiza zakupów · {label}
              {prevMonthTotalSpend > 0 && (
                <span className="ml-2 text-muted-foreground/70">
                  Porównaj z: {prevLabel}
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
                  `raport-${period.from}_${period.to}-${todaySlug()}`,
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
              title="Zakupy per centrum kosztów, z porównaniem do poprzedniego okresu"
              aria-label="Eksport Excel"
              className="gap-1.5 text-xs flex"
            >
              {exportingXlsx ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <FileSpreadsheet className="w-3.5 h-3.5" />
              )}
              <span className="hidden sm:inline">Eksport Excel</span>
            </Button>
            <PeriodSelector />
          </div>
        </div>

        {monthlyError && (
          <ErrorState
            onRetry={() => refetchMonthly()}
            message="Nie udało się pobrać raportu okresu. Spróbuj ponownie."
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
                <SpendHero bridge={bridge} monthName={label} />
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
                  subtitle="Średnia cena teraz vs poprzedni okres i vs zwykle"
                >
                  <PriceBenchmarkList rows={bridge.priceBenchmark} />
                </SectionCard>
                <SectionCard
                  title="Ilości produktów"
                  subtitle="Ile kupiłeś w tym okresie vs poprzedni"
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
                  <Suspense fallback={<Skeleton className="h-48 rounded-xl" />}>
                    <SpendTrendChart months={trendMonths} />
                  </Suspense>
                </div>
              </SectionCard>
            )}

            {/* 4. Porównanie centrów kosztów (tylko gdy skonfigurowane) */}
            <CostCenterComparisonSection />

            {/* 5. Kategorie + dostawcy — spójne bloki (dwie listy) */}
            {!isLoading && data && (data?.totalSpend ?? 0) > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <SectionCard title="Wydatki wg kategorii">
                  <div className="p-4 md:p-5">
                    <CategoryMiniList />
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
                  Brak danych za {label}
                </p>
                <p className="text-sm text-muted-foreground">
                  Zaimportuj faktury, aby zobaczyć raport.
                </p>
                <div className="mt-4 flex justify-center">
                  <Link href="/invoices">
                    <Button size="sm" className="gap-1.5">
                      <FileText className="w-3.5 h-3.5" />
                      Przejdź do faktur
                    </Button>
                  </Link>
                </div>
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
                    <p className="text-[11px] text-muted-foreground mt-0.5">Ceny i ilości w jednym miejscu — vs poprzedni okres, vs zwykle, gdzie taniej</p>
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
                <p className="text-foreground font-medium mb-1">Brak produktów za {label}</p>
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
                <p className="text-foreground font-medium mb-1">Brak dostawców za {label}</p>
              </div>
            )}
          </TabsContent>

          {/* ── KATEGORIE ───────────────────────────────────────────────────── */}
          <TabsContent value="kategorie" className="space-y-5">
            <Suspense fallback={<Skeleton className="h-80 rounded-xl" />}>
              <CategoryBarChart />
            </Suspense>
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
                <Suspense fallback={<Skeleton className="h-56 w-full" />}>
                  <CategoryTrendChart months={trendMonths} />
                </Suspense>
              </div>
            </SectionCard>
          </TabsContent>

        </Tabs>
      </div>
    </Layout>
  );
}
