import { useState, useMemo } from "react";
import { Layout, PageHeader } from "@/components/layout";
import { useGetMonthlyReport } from "@workspace/api-client-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from "recharts";
import {
  ChevronLeft, ChevronRight, ShoppingCart, FileText, Package, TrendingUp, ChevronDown, ChevronUp,
  ArrowUp, ArrowDown,
} from "lucide-react";
import { formatPrice } from "@/lib/format";
import { cn } from "@/lib/utils";
import { CATEGORIES, categorizeProduct } from "@/lib/categories";

// ─── Month helpers ────────────────────────────────────────────────────────────

function monthLabel(month: string) {
  const [year, m] = month.split("-");
  const names = ["Styczeń","Luty","Marzec","Kwiecień","Maj","Czerwiec","Lipiec","Sierpień","Wrzesień","Październik","Listopad","Grudzień"];
  return `${names[parseInt(m) - 1]} ${year}`;
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

// ─── Colors ──────────────────────────────────────────────────────────────────

const COLORS = [
  "hsl(173, 80%, 40%)",
  "hsl(200, 70%, 50%)",
  "hsl(220, 60%, 55%)",
  "hsl(250, 60%, 60%)",
  "hsl(280, 55%, 55%)",
];

// ─── Price change mini badge ──────────────────────────────────────────────────

function PriceChangeMini({
  current,
  prev,
}: {
  current: number;
  prev: number | null | undefined;
}) {
  if (prev == null || prev <= 0) return null;
  const pct = ((current - prev) / prev) * 100;
  if (Math.abs(pct) < 0.05) return null;

  const up = pct > 0;
  const Icon = up ? ArrowUp : ArrowDown;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 text-[10px] font-medium leading-none",
        up ? "text-red-500" : "text-emerald-600",
      )}
      title={`Poprzedni miesiąc: ${formatPrice(prev)}`}
    >
      <Icon className="w-2.5 h-2.5" />
      {Math.abs(pct).toFixed(1)}%
    </span>
  );
}

// ─── Quantity change mini badge ───────────────────────────────────────────────

function QuantityChangeMini({
  current,
  prev,
  unit,
}: {
  current: number;
  prev: number | null | undefined;
  unit: string;
}) {
  if (prev == null || prev <= 0) return null;
  const pct = ((current - prev) / prev) * 100;
  if (Math.abs(pct) < 0.05) return null;

  const up = pct > 0;
  const Icon = up ? ArrowUp : ArrowDown;
  const prevFormatted = prev % 1 === 0 ? prev : prev.toFixed(2);
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 text-[10px] font-medium leading-none",
        up ? "text-blue-500" : "text-orange-500",
      )}
      title={`Ilość poprzedni miesiąc: ${prevFormatted} ${unit}`}
    >
      <Icon className="w-2.5 h-2.5" />
      {Math.abs(pct).toFixed(1)}%&nbsp;il.
    </span>
  );
}

// ─── Stat card ────────────────────────────────────────────────────────────────

function StatCard({ label, value, sub, icon: Icon }: { label: string; value: string; sub?: string; icon: React.ElementType }) {
  return (
    <div className="bg-card border border-border rounded-xl p-4 md:p-5 flex items-start gap-3 md:gap-4">
      <div className="w-9 h-9 md:w-10 md:h-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
        <Icon className="w-4 h-4 md:w-5 md:h-5" />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground mb-0.5 truncate">{label}</p>
        <p className="text-lg md:text-xl font-bold text-foreground">{value}</p>
        {sub && <p className="text-xs text-muted-foreground mt-0.5 truncate">{sub}</p>}
      </div>
    </div>
  );
}

// ─── Supplier card ────────────────────────────────────────────────────────────

function SupplierCard({ supplier, rank }: {
  supplier: {
    supplierId: number;
    supplierName: string;
    totalSpend: number;
    invoiceCount: number;
    productCount: number;
    topProducts: Array<{
      productName: string;
      unit: string;
      totalQuantity: number;
      avgPrice: number;
      totalCost: number;
      prevMonthAvgPrice?: number | null;
      prevMonthTotalQuantity?: number | null;
    }>;
  };
  rank: number;
}) {
  const [expanded, setExpanded] = useState(rank === 0);
  const topProducts = supplier.topProducts.slice(0, expanded ? 15 : 5);

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      {/* Header row */}
      <div className="px-4 md:px-6 py-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold shrink-0 text-white"
            style={{ background: COLORS[rank % COLORS.length] }}
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
        <div className="text-right shrink-0">
          <p className="text-lg font-bold text-foreground">{formatPrice(supplier.totalSpend)}</p>
        </div>
      </div>

      {/* Mobile product list */}
      <div className="md:hidden border-t border-border">
        <div className="divide-y divide-border">
          {topProducts.map((p, i) => (
            <div key={i} className="px-4 py-3 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm text-foreground truncate">{p.productName}</p>
                <p className="text-xs text-muted-foreground">
                  {p.totalQuantity % 1 === 0 ? p.totalQuantity : p.totalQuantity.toFixed(2)} {p.unit}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-sm font-semibold text-foreground">{formatPrice(p.totalCost)}</p>
                <div className="flex items-center justify-end gap-1 mt-0.5">
                  <span className="text-[11px] text-muted-foreground">{formatPrice(p.avgPrice)}/{p.unit}</span>
                  <PriceChangeMini current={p.avgPrice} prev={p.prevMonthAvgPrice} />
                  <QuantityChangeMini current={p.totalQuantity} prev={p.prevMonthTotalQuantity} unit={p.unit} />
                </div>
              </div>
            </div>
          ))}
        </div>
        {supplier.topProducts.length > 5 && (
          <button
            className="w-full py-2.5 text-xs text-muted-foreground hover:text-foreground flex items-center justify-center gap-1 border-t border-border bg-secondary/20 active:bg-secondary/40 transition-colors"
            onClick={() => setExpanded(!expanded)}
          >
            {expanded
              ? <><ChevronUp className="w-3.5 h-3.5" />Zwiń</>
              : <><ChevronDown className="w-3.5 h-3.5" />Pokaż wszystkie ({supplier.topProducts.length})</>}
          </button>
        )}
      </div>

      {/* Desktop product table */}
      <div className="hidden md:block border-t border-border overflow-x-auto">
        <div className="grid grid-cols-[1fr_auto_auto_auto] gap-3 px-6 min-w-[560px] py-2 text-xs font-medium text-muted-foreground bg-secondary/30">
          <div>Produkt</div>
          <div className="text-right w-20">Ilość</div>
          <div className="text-right w-36">Śr. cena</div>
          <div className="text-right w-28">Łącznie</div>
        </div>
        <div className="divide-y divide-border">
          {topProducts.map((p, i) => (
            <div key={i} className="grid grid-cols-[1fr_auto_auto_auto] gap-3 px-6 min-w-[560px] py-2.5 items-center">
              <p className="text-sm text-foreground truncate pr-2">{p.productName}</p>
              <p className="text-sm text-muted-foreground text-right w-20">
                {p.totalQuantity % 1 === 0 ? p.totalQuantity : p.totalQuantity.toFixed(2)} {p.unit}
              </p>
              <div className="text-right w-36 flex flex-col items-end gap-0.5">
                <span className="text-sm text-foreground">{formatPrice(p.avgPrice)}/{p.unit}</span>
                <div className="flex items-center gap-1">
                  <PriceChangeMini current={p.avgPrice} prev={p.prevMonthAvgPrice} />
                  <QuantityChangeMini current={p.totalQuantity} prev={p.prevMonthTotalQuantity} unit={p.unit} />
                </div>
              </div>
              <p className="text-sm font-semibold text-foreground text-right w-28">{formatPrice(p.totalCost)}</p>
            </div>
          ))}
        </div>
        {supplier.topProducts.length > 5 && (
          <button
            className="w-full py-2.5 text-xs text-muted-foreground hover:text-foreground flex items-center justify-center gap-1 border-t border-border hover:bg-secondary/30 transition-colors"
            onClick={() => setExpanded(!expanded)}
          >
            {expanded
              ? <><ChevronUp className="w-3.5 h-3.5" />Zwiń</>
              : <><ChevronDown className="w-3.5 h-3.5" />Pokaż wszystkie ({supplier.topProducts.length})</>}
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Top products section ─────────────────────────────────────────────────────

type TopProduct = {
  productName: string;
  unit: string;
  totalQuantity: number;
  avgPrice: number;
  totalCost: number;
  supplierName?: string | null;
  prevMonthAvgPrice?: number | null;
  prevMonthTotalQuantity?: number | null;
};

function TopProductsSection({ products }: { products: TopProduct[] }) {
  const [activeCategory, setActiveCategory] = useState("wszystkie");

  const categorized = useMemo(() => {
    return products.map((p) => ({ ...p, category: categorizeProduct(p.productName) }));
  }, [products]);

  const presentCategories = useMemo(() => {
    const ids = new Set(categorized.map((p) => p.category));
    return CATEGORIES.filter((c) => ids.has(c.id));
  }, [categorized]);

  const hasInne = categorized.some((p) => p.category === "inne");

  const displayProducts = useMemo(() => {
    if (activeCategory === "wszystkie") return categorized;
    return categorized.filter((p) => p.category === activeCategory);
  }, [categorized, activeCategory]);

  const categoryTotals = useMemo(() => {
    const totals: Record<string, number> = {};
    categorized.forEach((p) => {
      totals[p.category] = (totals[p.category] || 0) + p.totalCost;
    });
    return totals;
  }, [categorized]);

  const totalAll = products.reduce((s, p) => s + p.totalCost, 0);

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden mb-8">
      {/* Header */}
      <div className="px-4 md:px-6 py-4 border-b border-border flex items-center gap-2">
        <Package className="w-4 h-4 text-primary shrink-0" />
        <p className="text-sm font-semibold text-foreground">Top produkty miesiąca</p>
        <span className="ml-auto text-xs text-muted-foreground shrink-0">wg kosztu</span>
      </div>

      {/* Category tabs — horizontally scrollable on mobile */}
      <div className="border-b border-border">
        <div className="flex items-center gap-1.5 px-4 pt-3 pb-2 overflow-x-auto scrollbar-none">
          <button
            onClick={() => setActiveCategory("wszystkie")}
            className={cn(
              "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors shrink-0",
              activeCategory === "wszystkie"
                ? "bg-primary text-primary-foreground"
                : "bg-secondary/60 text-muted-foreground hover:bg-secondary hover:text-foreground"
            )}
          >
            Wszystkie
            <span className={cn(
              "text-[10px] px-1.5 py-0.5 rounded-full",
              activeCategory === "wszystkie" ? "bg-white/20" : "bg-muted"
            )}>
              {products.length}
            </span>
          </button>

          {presentCategories.map((cat) => {
            const count = categorized.filter((p) => p.category === cat.id).length;
            return (
              <button
                key={cat.id}
                onClick={() => setActiveCategory(cat.id)}
                className={cn(
                  "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors shrink-0",
                  activeCategory === cat.id
                    ? "bg-primary text-primary-foreground"
                    : "bg-secondary/60 text-muted-foreground hover:bg-secondary hover:text-foreground"
                )}
              >
                <span>{cat.emoji}</span>
                {cat.label}
                <span className={cn(
                  "text-[10px] px-1.5 py-0.5 rounded-full",
                  activeCategory === cat.id ? "bg-white/20" : "bg-muted"
                )}>
                  {count}
                </span>
              </button>
            );
          })}

          {hasInne && (
            <button
              onClick={() => setActiveCategory("inne")}
              className={cn(
                "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors shrink-0",
                activeCategory === "inne"
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary/60 text-muted-foreground hover:bg-secondary hover:text-foreground"
              )}
            >
              Inne
              <span className={cn(
                "text-[10px] px-1.5 py-0.5 rounded-full",
                activeCategory === "inne" ? "bg-white/20" : "bg-muted"
              )}>
                {categorized.filter((p) => p.category === "inne").length}
              </span>
            </button>
          )}
        </div>

        {/* Active category spend summary */}
        {activeCategory !== "wszystkie" && (
          <p className="px-4 pb-2.5 text-xs text-muted-foreground">
            Wydano:{" "}
            <span className="font-semibold text-foreground">
              {formatPrice(categoryTotals[activeCategory] ?? 0)}
            </span>
            <span className="ml-1">
              ({totalAll > 0 ? ((categoryTotals[activeCategory] ?? 0) / totalAll * 100).toFixed(1) : 0}% budżetu)
            </span>
          </p>
        )}
      </div>

      {displayProducts.length === 0 ? (
        <div className="py-8 text-center text-sm text-muted-foreground">
          Brak produktów w tej kategorii w danym miesiącu.
        </div>
      ) : (
        <>
          {/* Mobile card list */}
          <div className="md:hidden divide-y divide-border">
            {displayProducts.map((p, i) => (
              <div key={i} className="px-4 py-3 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{p.productName}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {p.supplierName ?? "—"} · {p.totalQuantity % 1 === 0 ? p.totalQuantity : p.totalQuantity.toFixed(2)} {p.unit}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-sm font-bold text-foreground">{formatPrice(p.totalCost)}</p>
                  <div className="flex items-center justify-end gap-1 mt-0.5">
                    <span className="text-[11px] text-muted-foreground">{formatPrice(p.avgPrice)}/{p.unit}</span>
                    <PriceChangeMini current={p.avgPrice} prev={p.prevMonthAvgPrice} />
                    <QuantityChangeMini current={p.totalQuantity} prev={p.prevMonthTotalQuantity} unit={p.unit} />
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Desktop table */}
          <div className="hidden md:block overflow-x-auto">
            <div className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-3 px-6 min-w-[700px] py-2 text-xs font-medium text-muted-foreground bg-secondary/30">
              <div>Produkt</div>
              <div className="text-right w-32">Dostawca</div>
              <div className="text-right w-20">Ilość</div>
              <div className="text-right w-36">Śr. cena</div>
              <div className="text-right w-28">Łącznie</div>
            </div>
            <div className="divide-y divide-border">
              {displayProducts.map((p, i) => (
                <div key={i} className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-3 px-6 min-w-[700px] py-3 items-center">
                  <p className="text-sm font-medium text-foreground truncate pr-2">{p.productName}</p>
                  <p className="text-xs text-muted-foreground text-right w-32 truncate">{p.supplierName ?? "—"}</p>
                  <p className="text-sm text-muted-foreground text-right w-20">
                    {p.totalQuantity % 1 === 0 ? p.totalQuantity : p.totalQuantity.toFixed(2)} {p.unit}
                  </p>
                  <div className="text-right w-36 flex flex-col items-end gap-0.5">
                    <span className="text-sm text-foreground">{formatPrice(p.avgPrice)}/{p.unit}</span>
                    <div className="flex items-center gap-1">
                      <PriceChangeMini current={p.avgPrice} prev={p.prevMonthAvgPrice} />
                      <QuantityChangeMini current={p.totalQuantity} prev={p.prevMonthTotalQuantity} unit={p.unit} />
                    </div>
                  </div>
                  <p className="text-sm font-bold text-foreground text-right w-28">{formatPrice(p.totalCost)}</p>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function Reports() {
  const [viewMode, setViewMode] = useState<"month" | "all">("month");
  const [month, setMonth] = useState(currentMonth());
  const isCurrentMonth = month === currentMonth();

  const reportMonth = viewMode === "all" ? "all" : month;

  const { data, isLoading, isError } = useGetMonthlyReport(
    { month: reportMonth },
    { query: { queryKey: ["reports-monthly", reportMonth] } }
  );

  const chartData = useMemo(() => {
    if (!data) return [];
    return data.suppliers
      .slice(0, 8)
      .map((s) => ({ name: s.supplierName.split(" ")[0], value: s.totalSpend, full: s.supplierName }));
  }, [data]);

  return (
    <Layout>
      <div className="px-4 py-5 md:px-8 md:py-8">
        <PageHeader
          title="Raporty"
          subtitle={viewMode === "all" ? "Wszystkie okresy — łączne podsumowanie" : "Miesięczne podsumowanie zakupów i analiza dostawców"}
          action={
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
              {/* Mode toggle */}
              <div className="flex items-center bg-card border border-border rounded-lg p-1 gap-0.5 self-start sm:self-auto">
                <button
                  onClick={() => setViewMode("month")}
                  className={cn(
                    "px-3 py-1.5 rounded-md text-xs font-medium transition-colors",
                    viewMode === "month"
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                  )}
                >
                  Dany miesiąc
                </button>
                <button
                  onClick={() => setViewMode("all")}
                  className={cn(
                    "px-3 py-1.5 rounded-md text-xs font-medium transition-colors",
                    viewMode === "all"
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                  )}
                >
                  Wszystko razem
                </button>
              </div>
              {/* Month navigator */}
              {viewMode === "month" && (
                <div className="flex items-center gap-1 bg-card border border-border rounded-lg px-1 py-1 self-start sm:self-auto">
                  <Button variant="ghost" size="icon" className="w-8 h-8 shrink-0" onClick={() => setMonth(prevMonth(month))}>
                    <ChevronLeft className="w-4 h-4" />
                  </Button>
                  <span className="text-sm font-medium min-w-32 text-center px-1 tabular-nums">{monthLabel(month)}</span>
                  <Button
                    variant="ghost" size="icon" className="w-8 h-8 shrink-0"
                    onClick={() => setMonth(nextMonth(month))}
                    disabled={isCurrentMonth}
                  >
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                </div>
              )}
            </div>
          }
        />

        {isError && (
          <div className="mb-6 rounded-xl border border-destructive/30 bg-destructive/5 px-5 py-3 text-sm text-destructive">
            Nie udało się załadować raportu. Odśwież stronę lub spróbuj ponownie później.
          </div>
        )}

        {/* Summary cards — 2 cols on mobile, 3 on desktop */}
        {isLoading ? (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 md:gap-4 mb-6 md:mb-8">
            {[0,1,2].map(i => <Skeleton key={i} className={cn("h-20 md:h-24 rounded-xl", i === 2 && "col-span-2 md:col-span-1")} />)}
          </div>
        ) : data ? (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 md:gap-4 mb-6 md:mb-8">
            <StatCard label="Łączne wydatki" value={formatPrice(data.totalSpend)} sub={`${data.invoiceCount} faktur`} icon={ShoppingCart} />
            <StatCard label="Produkty" value={String(data.productCount)} sub="unikalnych pozycji" icon={Package} />
            <div className="col-span-2 md:col-span-1">
              <StatCard label="Liczba faktur" value={String(data.invoiceCount)} sub={`od ${data.suppliers.length} dostawców`} icon={FileText} />
            </div>
          </div>
        ) : null}

        {/* Supplier spend chart */}
        {!isLoading && data && data.suppliers.length > 0 && (
          <div className="bg-card border border-border rounded-xl p-4 md:p-6 mb-6 md:mb-8">
            <p className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-primary" />
              Wydatki wg dostawcy
            </p>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={chartData} margin={{ top: 4, right: 4, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                  axisLine={false}
                  tickLine={false}
                  interval={0}
                />
                <YAxis
                  tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v) => `${Math.round(v / 1000)}k`}
                  width={36}
                />
                <Tooltip
                  contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: "8px", fontSize: "12px" }}
                  formatter={(v: number, _, props) => [formatPrice(v), props.payload?.full]}
                />
                <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                  {chartData.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Top products with category tabs */}
        {!isLoading && data && data.topProducts.length > 0 && (
          <TopProductsSection products={data.topProducts} />
        )}

        {/* Per-supplier reports */}
        {isLoading ? (
          <div className="space-y-4">
            {[0, 1, 2].map(i => <Skeleton key={i} className="h-48 md:h-64 rounded-xl" />)}
          </div>
        ) : data && data.suppliers.length > 0 ? (
          <div className="space-y-4">
            <p className="text-sm font-semibold text-foreground">Raport per dostawca</p>
            {data.suppliers.map((supplier, i) => (
              <SupplierCard key={supplier.supplierId} supplier={supplier} rank={i} />
            ))}
          </div>
        ) : !isLoading ? (
          <div className="bg-card border border-border rounded-xl py-16 text-center px-4">
            <FileText className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-foreground font-medium mb-1">Brak danych za {viewMode === "month" ? monthLabel(month) : "żaden okres"}</p>
            <p className="text-sm text-muted-foreground">Zaimportuj faktury, aby zobaczyć raport.</p>
          </div>
        ) : null}
      </div>
    </Layout>
  );
}
