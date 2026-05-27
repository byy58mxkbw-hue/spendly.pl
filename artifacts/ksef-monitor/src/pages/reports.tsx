import { useState, useMemo } from "react";
import { Layout, PageHeader } from "@/components/layout";
import { useGetMonthlyReport, useGetCategorySpend, useGetCategorySpendTrend } from "@workspace/api-client-react";
import type { CategorySpendItem } from "@workspace/api-client-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
  LineChart, Line, XAxis, YAxis, CartesianGrid,
} from "recharts";
import {
  ChevronLeft, ChevronRight, ShoppingCart, FileText, Package,
  ChevronDown, ChevronUp, ArrowUp, ArrowDown, Download,
} from "lucide-react";
import { formatPrice } from "@/lib/format";
import { cn } from "@/lib/utils";
import { CATEGORIES } from "@/lib/categories";
import { exportToCsv, todaySlug } from "@/lib/export-csv";

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

// ─── Category spend section ───────────────────────────────────────────────────

type CategoryGroup = {
  id: string;
  label: string;
  emoji: string;
  spend: number;
  products: CategorySpendItem[];
};

function CategorySpendSection({ month }: { month: string }) {
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  const prevMonthStr = prevMonth(month);

  const { data: currentData, isLoading } = useGetCategorySpend(
    { month },
    { query: { queryKey: ["category-spend", month] } },
  );

  const { data: prevData } = useGetCategorySpend(
    { month: prevMonthStr },
    { query: { queryKey: ["category-spend", prevMonthStr] } },
  );

  const categoryGroups: CategoryGroup[] = useMemo(() => {
    if (!currentData) return [];
    const map = new Map<string, { spend: number; products: CategorySpendItem[] }>();
    for (const item of currentData) {
      const cat = item.category ?? "inne";
      if (!map.has(cat)) map.set(cat, { spend: 0, products: [] });
      const g = map.get(cat)!;
      g.spend += item.totalSpend;
      g.products.push(item);
    }
    return Array.from(map.entries())
      .map(([id, { spend, products }]) => {
        const catDef = CATEGORIES.find((c) => c.id === id);
        return {
          id,
          label: catDef?.label ?? "Inne",
          emoji: catDef?.emoji ?? "📦",
          spend,
          products: [...products].sort((a, b) => b.totalSpend - a.totalSpend),
        };
      })
      .sort((a, b) => b.spend - a.spend);
  }, [currentData]);

  const prevCategoryMap = useMemo(() => {
    if (!prevData) return new Map<string, number>();
    const map = new Map<string, number>();
    for (const item of prevData) {
      const cat = item.category ?? "inne";
      map.set(cat, (map.get(cat) ?? 0) + item.totalSpend);
    }
    return map;
  }, [prevData]);

  const totalSpend = useMemo(
    () => categoryGroups.reduce((s, c) => s + c.spend, 0),
    [categoryGroups],
  );

  const pieData = useMemo(
    () =>
      categoryGroups.map((c, i) => ({
        name: `${c.emoji} ${c.label}`,
        value: c.spend,
        id: c.id,
        fill: COLORS[i % COLORS.length],
      })),
    [categoryGroups],
  );

  if (isLoading) {
    return <Skeleton className="h-64 rounded-xl mb-6 md:mb-8" />;
  }
  if (!currentData || categoryGroups.length === 0) return null;

  return (
    <div className="mb-6 md:mb-8">
      <p className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
        <Package className="w-4 h-4 text-primary" />
        Wydatki według kategorii
      </p>

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        {/* Donut chart */}
        <div className="border-b border-border px-4 pt-4 pb-2 md:px-6">
          <ResponsiveContainer width="100%" height={190}>
            <PieChart>
              <Pie
                data={pieData}
                cx="50%"
                cy="50%"
                innerRadius={52}
                outerRadius={82}
                paddingAngle={2}
                dataKey="value"
                onClick={(entry) => {
                  setActiveCategory(
                    activeCategory === entry.id ? null : entry.id,
                  );
                }}
                style={{ cursor: "pointer" }}
              >
                {pieData.map((entry, i) => (
                  <Cell
                    key={entry.id}
                    fill={entry.fill}
                    opacity={
                      !activeCategory || activeCategory === entry.id ? 1 : 0.35
                    }
                  />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  background: "hsl(var(--card))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: "8px",
                  fontSize: "12px",
                }}
                formatter={(v: number) => [formatPrice(v)]}
              />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Category rows */}
        <div className="divide-y divide-border">
          {categoryGroups.map((cat, i) => {
            const pct = totalSpend > 0 ? (cat.spend / totalSpend) * 100 : 0;
            const prevSpend = prevCategoryMap.get(cat.id) ?? 0;
            const trend =
              prevSpend > 0
                ? ((cat.spend - prevSpend) / prevSpend) * 100
                : null;
            const isActive = activeCategory === cat.id;
            const color = COLORS[i % COLORS.length];

            return (
              <div key={cat.id}>
                <button
                  onClick={() =>
                    setActiveCategory(isActive ? null : cat.id)
                  }
                  className={cn(
                    "w-full px-4 md:px-6 py-3 flex items-center gap-3 text-left transition-colors",
                    isActive
                      ? "bg-primary/5"
                      : "hover:bg-secondary/30",
                  )}
                >
                  {/* Color dot */}
                  <div
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ background: color }}
                  />

                  {/* Label + progress bar */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 mb-1.5">
                      <span className="text-sm leading-none">{cat.emoji}</span>
                      <span className="text-sm font-medium text-foreground">
                        {cat.label}
                      </span>
                      {trend !== null && (
                        <span
                          className={cn(
                            "inline-flex items-center gap-0.5 text-[10px] font-medium",
                            trend > 0 ? "text-red-500" : "text-emerald-600",
                          )}
                        >
                          {trend > 0 ? (
                            <ArrowUp className="w-2.5 h-2.5" />
                          ) : (
                            <ArrowDown className="w-2.5 h-2.5" />
                          )}
                          {Math.abs(trend).toFixed(1)}%
                        </span>
                      )}
                    </div>
                    <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${pct}%`, background: color }}
                      />
                    </div>
                  </div>

                  {/* Spend + % */}
                  <div className="text-right shrink-0 min-w-[80px]">
                    <p className="text-sm font-bold text-foreground">
                      {formatPrice(cat.spend)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {pct.toFixed(1)}%
                    </p>
                  </div>

                  {/* Chevron */}
                  {isActive ? (
                    <ChevronUp className="w-4 h-4 text-muted-foreground shrink-0" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
                  )}
                </button>

                {/* Drill-down product list */}
                {isActive && (
                  <div className="border-t border-border bg-secondary/10">
                    {/* Header row */}
                    <div className="px-6 md:px-8 py-1.5 grid grid-cols-[1fr_auto_auto_auto] gap-3 items-center">
                      <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Produkt / Dostawca</p>
                      <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide text-right w-20">Ilość</p>
                      <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide text-right w-24">Śr. cena/jed.</p>
                      <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide text-right w-24">Łączny koszt</p>
                    </div>
                    <div className="divide-y divide-border">
                      {(() => {
                        // Group rows by product name
                        const grouped = new Map<string, CategorySpendItem[]>();
                        for (const p of cat.products) {
                          const key = p.productName;
                          if (!grouped.has(key)) grouped.set(key, []);
                          grouped.get(key)!.push(p);
                        }
                        return Array.from(grouped.entries()).map(([name, rows]) => {
                          const multi = rows.length > 1;
                          const combinedSpend = rows.reduce((s, r) => s + r.totalSpend, 0);
                          return (
                            <div key={name} className="divide-y divide-border">
                              {multi ? (
                                <>
                                  {/* Product header row — combined total */}
                                  <div className="px-6 md:px-8 py-2 grid grid-cols-[1fr_auto_auto_auto] gap-3 items-center bg-secondary/20">
                                    <p className="text-sm font-semibold text-foreground truncate">{name}</p>
                                    <p className="text-sm text-muted-foreground text-right w-20 shrink-0">—</p>
                                    <p className="text-sm text-muted-foreground text-right w-24 shrink-0">—</p>
                                    <p className="text-sm font-semibold text-foreground text-right w-24 shrink-0">
                                      {formatPrice(combinedSpend)}
                                    </p>
                                  </div>
                                  {/* Per-supplier sub-rows */}
                                  {rows.map((p, ri) => (
                                    <div
                                      key={ri}
                                      className="pl-10 pr-6 md:pl-14 md:pr-8 py-1.5 grid grid-cols-[1fr_auto_auto_auto] gap-3 items-center"
                                    >
                                      <div className="min-w-0 flex items-center gap-1.5">
                                        <span className="text-muted-foreground/40 text-xs shrink-0">└</span>
                                        <p className="text-sm text-muted-foreground truncate">{p.supplierName ?? "—"}</p>
                                      </div>
                                      <p className="text-sm text-muted-foreground text-right w-20 shrink-0">
                                        {p.totalQuantity != null
                                          ? `${new Intl.NumberFormat("pl-PL", { maximumFractionDigits: 2 }).format(p.totalQuantity)}${p.unit ? ` ${p.unit}` : ""}`
                                          : "—"}
                                      </p>
                                      <p className="text-sm text-muted-foreground text-right w-24 shrink-0">
                                        {p.avgUnitPrice != null ? formatPrice(p.avgUnitPrice) : "—"}
                                      </p>
                                      <p className="text-sm text-foreground text-right w-24 shrink-0">
                                        {formatPrice(p.totalSpend)}
                                      </p>
                                    </div>
                                  ))}
                                </>
                              ) : (
                                /* Single-supplier row — unchanged appearance */
                                <div className="px-6 md:px-8 py-2 grid grid-cols-[1fr_auto_auto_auto] gap-3 items-center">
                                  <div className="min-w-0">
                                    <p className="text-sm text-foreground truncate">{rows[0].productName}</p>
                                    {rows[0].supplierName && (
                                      <p className="text-xs text-muted-foreground truncate">{rows[0].supplierName}</p>
                                    )}
                                  </div>
                                  <p className="text-sm text-muted-foreground text-right w-20 shrink-0">
                                    {rows[0].totalQuantity != null
                                      ? `${new Intl.NumberFormat("pl-PL", { maximumFractionDigits: 2 }).format(rows[0].totalQuantity)}${rows[0].unit ? ` ${rows[0].unit}` : ""}`
                                      : "—"}
                                  </p>
                                  <p className="text-sm text-muted-foreground text-right w-24 shrink-0">
                                    {rows[0].avgUnitPrice != null ? formatPrice(rows[0].avgUnitPrice) : "—"}
                                  </p>
                                  <p className="text-sm font-semibold text-foreground text-right w-24 shrink-0">
                                    {formatPrice(rows[0].totalSpend)}
                                  </p>
                                </div>
                              )}
                            </div>
                          );
                        });
                      })()}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Category spend trend chart ───────────────────────────────────────────────

function shortMonthLabel(month: string) {
  const [year, m] = month.split("-");
  const names = ["Sty","Lut","Mar","Kwi","Maj","Cze","Lip","Sie","Wrz","Paź","Lis","Gru"];
  return `${names[parseInt(m) - 1]} '${year.slice(2)}`;
}

function CategorySpendTrendSection() {
  const { data, isLoading } = useGetCategorySpendTrend(
    { months: 6 },
    { query: { queryKey: ["category-spend-trend", 6] } },
  );

  // Build sorted list of all categories by total spend across all months
  const allCategories = useMemo(() => {
    if (!data || data.length === 0) return [];
    const totals = new Map<string, number>();
    for (const row of data) {
      const cat = row.category ?? "inne";
      totals.set(cat, (totals.get(cat) ?? 0) + row.totalSpend);
    }
    return Array.from(totals.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([id]) => id);
  }, [data]);

  // Default selection: top 5 categories
  const [selected, setSelected] = useState<Set<string> | null>(null);
  const activeSelected: Set<string> = selected ?? new Set(allCategories.slice(0, 5));

  // Build chart data: one entry per month
  const chartData = useMemo(() => {
    if (!data || data.length === 0) return [];
    // Collect all months in order
    const monthSet = new Set<string>();
    for (const row of data) monthSet.add(row.month);
    const months = Array.from(monthSet).sort();

    return months.map((month) => {
      const entry: Record<string, string | number> = { month, label: shortMonthLabel(month) };
      for (const row of data) {
        if (row.month === month) {
          const cat = row.category ?? "inne";
          entry[cat] = (entry[cat] as number ?? 0) + row.totalSpend;
        }
      }
      return entry;
    });
  }, [data]);

  const toggleCategory = (id: string) => {
    const base = selected ?? new Set(allCategories.slice(0, 5));
    const next = new Set(base);
    if (next.has(id)) {
      if (next.size > 1) next.delete(id);
    } else {
      next.add(id);
    }
    setSelected(next);
  };

  if (isLoading) {
    return <Skeleton className="h-72 rounded-xl mb-6 md:mb-8" />;
  }
  if (!data || data.length === 0 || allCategories.length === 0) return null;

  const visibleCategories = allCategories.filter((id) => activeSelected.has(id));

  return (
    <div className="mb-6 md:mb-8">
      <p className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
        <Package className="w-4 h-4 text-primary" />
        Trend wydatków według kategorii
      </p>

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        {/* Category selector pills */}
        <div className="px-4 pt-4 pb-3 md:px-6 flex flex-wrap gap-2 border-b border-border">
          {allCategories.map((id, i) => {
            const catDef = CATEGORIES.find((c) => c.id === id);
            const label = catDef?.label ?? "Inne";
            const emoji = catDef?.emoji ?? "📦";
            const isActive = activeSelected.has(id);
            const color = COLORS[i % COLORS.length];
            return (
              <button
                key={id}
                onClick={() => toggleCategory(id)}
                className={cn(
                  "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-all border",
                  isActive
                    ? "text-white border-transparent"
                    : "bg-transparent text-muted-foreground border-border hover:border-foreground/30",
                )}
                style={isActive ? { background: color, borderColor: color } : {}}
              >
                <span>{emoji}</span>
                <span>{label}</span>
              </button>
            );
          })}
        </div>

        {/* Line chart */}
        <div className="px-2 pt-4 pb-2 md:px-4">
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={chartData} margin={{ top: 4, right: 16, left: 8, bottom: 4 }}>
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
                tickFormatter={(v: number) =>
                  v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(Math.round(v))
                }
                width={48}
              />
              <Tooltip
                contentStyle={{
                  background: "hsl(var(--card))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: "8px",
                  fontSize: "12px",
                }}
                formatter={(value: number, name: string) => {
                  const catDef = CATEGORIES.find((c) => c.id === name);
                  const label = catDef ? `${catDef.emoji} ${catDef.label}` : name;
                  return [new Intl.NumberFormat("pl-PL", { style: "currency", currency: "PLN" }).format(value), label];
                }}
              />
              {visibleCategories.map((id, i) => {
                const colorIdx = allCategories.indexOf(id);
                return (
                  <Line
                    key={id}
                    type="monotone"
                    dataKey={id}
                    stroke={COLORS[colorIdx % COLORS.length]}
                    strokeWidth={2}
                    dot={{ r: 3, fill: COLORS[colorIdx % COLORS.length] }}
                    activeDot={{ r: 5 }}
                    connectNulls
                  />
                );
              })}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
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

  return (
    <Layout>
      <div className="px-4 py-5 md:px-8 md:py-8">
        <PageHeader
          title="Raporty"
          subtitle={viewMode === "all" ? "Wszystkie okresy — łączne podsumowanie" : "Miesięczne podsumowanie zakupów i analiza dostawców"}
          action={
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
              {data && (data.suppliers.length > 0 || data.topProducts.length > 0) && (
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 self-start sm:self-auto"
                  onClick={() =>
                    exportToCsv(
                      [
                        ["Dostawca", "Łączne wydatki (PLN)", "Faktury", "Produkty"],
                        ...data.suppliers.map((s) => [
                          s.supplierName,
                          s.totalSpend,
                          s.invoiceCount,
                          s.productCount,
                        ]),
                      ],
                      `raport-${reportMonth}-${todaySlug()}.csv`,
                    )
                  }
                  data-testid="btn-export-csv-reports"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Eksportuj CSV</span>
                  <span className="sm:hidden">CSV</span>
                </Button>
              )}
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
                    variant="ghost"
                    size="icon"
                    className="w-8 h-8 shrink-0"
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

        {/* Category spend — only in month mode */}
        {viewMode === "month" && !isLoading && data && data.topProducts.length > 0 && (
          <CategorySpendSection month={month} />
        )}

        {/* Category spend trend — only in month mode */}
        {viewMode === "month" && !isLoading && data && data.topProducts.length > 0 && (
          <CategorySpendTrendSection />
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
