import { useState, useEffect, useMemo } from "react";
import { Layout, PageHeader } from "@/components/layout";
import { useCostCenter } from "@/contexts/cost-center-context";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListProducts,
  useListSuppliers,
  useGetProductPriceHistory,
  useGetProductSupplierComparison,
  useCorrectProductCategory,
  useGetCategorySpend,
  useListCategories,
  useCreateCategory,
  useDeleteCategory,
  useUpdateCategory,
  useBulkVerifyProducts,
  getListCategoriesQueryKey,
  getGetProductPriceHistoryQueryKey,
  getGetProductSupplierComparisonQueryKey,
  getListProductsQueryKey,
} from "@workspace/api-client-react";
import { currentMonth } from "@/lib/month";
import { MonthNavigator } from "@/components/month-navigator";
import { categorizeProduct } from "@/lib/categories";
import type { CategoryItem } from "@workspace/api-client-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import {
  Search,
  TrendingUp,
  TrendingDown,
  Minus,
  Package,
  ArrowDownAZ,
  ArrowUpZA,
  TrendingUp as PriceIcon,
  Building2,
  GitCompare,
  Trophy,
  ShoppingCart,
  Calendar,
  Layers,
  X,
  Plus,
  Trash2,
  Pencil,
  Download,
  AlertTriangle,
  ChevronDown,
  CheckSquare,
  CheckCheck,
} from "lucide-react";
import { formatPrice, formatPercent, formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { exportToCsv, todaySlug } from "@/lib/export-csv";

type ProductItem = {
  id: number;
  name: string;
  unit: string;
  category?: string | null;
  subcategory?: string | null;
  classificationConfidence?: number | null;
  needsReview?: boolean | null;
  latestPrice?: number | null;
  supplierName?: string | null;
  supplierId?: number | null;
  lastPurchaseDate?: string | null;
  priceChangePercent?: number | null;
  supplierCount?: number;
  totalQuantity?: number | null;
};

function normalize(name: string) {
  return name.replace(/^[#\s]+/, "").toLowerCase().trim();
}

function matchesKeyword(productName: string, keyword: string): boolean {
  const norm = normalize(productName);
  const words = keyword.toLowerCase().trim().split(/\s+/).filter(Boolean);
  return words.every((w) => norm.includes(w));
}

function KeywordComparisonModal({
  products,
  onClose,
}: {
  products: ProductItem[];
  onClose: () => void;
}) {
  const [keyword, setKeyword] = useState("");

  const matched = keyword.trim().length >= 2
    ? products.filter((p) => matchesKeyword(p.name, keyword))
    : [];

  // Group by supplier
  const bySupplier = matched.reduce<Record<string, { supplierName: string; supplierId: number | null; products: ProductItem[] }>>(
    (acc, p) => {
      const key = p.supplierName ?? "Nieznany";
      if (!acc[key]) acc[key] = { supplierName: key, supplierId: p.supplierId ?? null, products: [] };
      acc[key].products.push(p);
      return acc;
    },
    {}
  );

  // Pre-calculate minPrice for each supplier to avoid O(N²) Math.min in sort
  const supplierGroups = Object.values(bySupplier)
    .map(group => ({
      ...group,
      minPrice: Math.min(...group.products.map((p) => p.latestPrice ?? Infinity))
    }))
    .sort((a, b) => a.minPrice - b.minPrice);

  // Find overall cheapest single product
  const allWithPrice = matched.filter((p) => p.latestPrice != null);
  const cheapest = allWithPrice.length
    ? allWithPrice.reduce((best, p) => (p.latestPrice! < best.latestPrice! ? p : best))
    : null;

  const hasMultipleSuppliers = supplierGroups.length > 1;

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Layers className="w-5 h-5 text-primary" />
            Porównaj po frazie
          </DialogTitle>
        </DialogHeader>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            autoFocus
            placeholder="Wpisz frazę, np. filet z kurczaka, boczek, pomidor..."
            className="pl-9 pr-9"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
          />
          {keyword && (
            <button
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              onClick={() => setKeyword("")}
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {keyword.trim().length >= 2 && matched.length === 0 && (
          <div className="text-center py-8 text-muted-foreground text-sm">
            Brak produktów pasujących do frazy „{keyword}".
          </div>
        )}

        {matched.length > 0 && (
          <div className="space-y-4">
            {/* Summary bar */}
            <div className="flex items-center justify-between text-xs text-muted-foreground bg-secondary/40 rounded-lg px-3 py-2">
              <span>
                Znaleziono <strong className="text-foreground">{matched.length}</strong> produktów u{" "}
                <strong className="text-foreground">{supplierGroups.length}</strong> dostawców
              </span>
              {cheapest && (
                <span className="flex items-center gap-1">
                  <Trophy className="w-3.5 h-3.5 text-primary" />
                  Najtańszy:{" "}
                  <strong className="text-foreground">{formatPrice(cheapest.latestPrice!)}/{cheapest.unit}</strong>
                  {" "}u{" "}
                  <span className="text-foreground">{cheapest.supplierName}</span>
                </span>
              )}
            </div>

            {/* Supplier groups */}
            {supplierGroups.map((group, gi) => {
              const color = SUPPLIER_COLORS[gi % SUPPLIER_COLORS.length];
              const groupMinPrice = (group as any).minPrice;
              const isCheapestSupplier = hasMultipleSuppliers && cheapest?.supplierName === group.supplierName;

              return (
                <div
                  key={group.supplierName}
                  className={cn(
                    "rounded-xl border overflow-hidden",
                    isCheapestSupplier ? "border-primary/40" : "border-border"
                  )}
                >
                  {/* Supplier header */}
                  <div
                    className={cn(
                      "flex items-center justify-between px-4 py-3",
                      isCheapestSupplier ? "bg-primary/5" : "bg-secondary/30"
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: color }} />
                      <p className="text-sm font-semibold text-foreground">{group.supplierName}</p>
                      {isCheapestSupplier && (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-primary bg-primary/10 px-2 py-0.5 rounded-full">
                          <Trophy className="w-3 h-3" />
                          Najtańszy
                        </span>
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {group.products.length} {group.products.length === 1 ? "produkt" : "produktów"}
                    </span>
                  </div>

                  {/* Products in this supplier */}
                  <div className="divide-y divide-border">
                    {group.products
                      .sort((a, b) => (a.latestPrice ?? 0) - (b.latestPrice ?? 0))
                      .map((p) => {
                        const isGroupCheapest = p.latestPrice != null && p.latestPrice === groupMinPrice && group.products.length > 1;
                        const isOverallCheapest = hasMultipleSuppliers && p.id === cheapest?.id;

                        return (
                          <div key={p.id} className="flex items-center gap-4 px-4 py-3">
                            <div className="flex-1 min-w-0">
                              <p className={cn(
                                "text-sm text-foreground truncate",
                                (isGroupCheapest || isOverallCheapest) && "font-medium"
                              )}>
                                {p.name.replace(/^#/, "")}
                              </p>
                              <p className="text-xs text-muted-foreground mt-0.5">
                                {p.unit}
                                {p.totalQuantity != null && p.totalQuantity > 0 && (
                                  <> · <span className="text-foreground/70">{new Intl.NumberFormat("pl-PL", { maximumFractionDigits: 2 }).format(p.totalQuantity)} {p.unit}</span></>
                                )}
                                {" · "} ostatni zakup: {formatDate(p.lastPurchaseDate)}
                              </p>
                            </div>
                            <div className="text-right shrink-0">
                              <p className={cn(
                                "text-sm font-semibold",
                                isOverallCheapest ? "text-primary" : "text-foreground"
                              )}>
                                {p.latestPrice != null ? `${formatPrice(p.latestPrice)}/${p.unit}` : "—"}
                              </p>
                              {p.priceChangePercent != null && (
                                <PriceChangeBadge change={p.priceChangePercent} />
                              )}
                            </div>
                          </div>
                        );
                      })}
                  </div>
                </div>
              );
            })}

            {/* Price spread table — only when multiple suppliers */}
            {hasMultipleSuppliers && allWithPrice.length > 0 && (() => {
              const minP = Math.min(...allWithPrice.map((p) => p.latestPrice!));
              const maxP = Math.max(...allWithPrice.map((p) => p.latestPrice!));
              const spread = maxP - minP;
              const spreadPct = (spread / minP) * 100;
              return (
                <div className="bg-secondary/40 rounded-lg px-4 py-3 flex items-center justify-between gap-4 text-sm">
                  <span className="text-muted-foreground">Rozpiętość cen:</span>
                  <span>
                    <strong className="text-emerald-600">{formatPrice(minP)}</strong>
                    <span className="text-muted-foreground mx-2">—</span>
                    <strong className="text-destructive">{formatPrice(maxP)}</strong>
                    <span className="text-xs text-muted-foreground ml-2">
                      (różnica {spreadPct.toFixed(0)}%)
                    </span>
                  </span>
                </div>
              );
            })()}
          </div>
        )}

        {keyword.trim().length < 2 && (
          <div className="text-center py-6 text-muted-foreground text-sm space-y-1">
            <p>Wpisz co najmniej 2 znaki, aby porównać produkty między dostawcami.</p>
            <p className="text-xs">Przykłady: filet z kurczaka, boczek, pomidor, banan</p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

type SortKey = "name-asc" | "name-desc" | "price-desc" | "price-asc" | "change-desc" | "supplier-asc" | "quantity-desc" | "quantity-asc";

const SUPPLIER_COLORS = [
  "hsl(173, 80%, 40%)",
  "hsl(220, 70%, 55%)",
  "hsl(350, 70%, 55%)",
  "hsl(40, 80%, 50%)",
  "hsl(280, 60%, 55%)",
];

function PriceChangeBadge({ change }: { change: number | null | undefined }) {
  if (change == null) return <span className="text-muted-foreground text-sm">—</span>;
  const up = change > 0;
  const down = change < 0;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full",
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

export function PriceHistoryModal({
  productId,
  productName,
  onClose,
  focusSupplierId,
  focusSupplierName,
}: {
  productId: number;
  productName: string;
  onClose: () => void;
  focusSupplierId?: number;
  focusSupplierName?: string;
}) {
  const params = focusSupplierId != null ? { supplierId: focusSupplierId } : undefined;
  const { data: history, isLoading } = useGetProductPriceHistory(productId, params, {
    query: {
      enabled: true,
      queryKey: focusSupplierId != null
        ? [...getGetProductPriceHistoryQueryKey(productId), focusSupplierId]
        : getGetProductPriceHistoryQueryKey(productId),
    },
  });

  const chartData = history?.map((h) => ({
    date: formatDate(h.date),
    price: h.price,
    supplier: h.supplierName,
  }));

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col overflow-hidden" data-testid="dialog-price-history">
        <DialogHeader className="shrink-0">
          <DialogTitle>Historia cen: {productName}</DialogTitle>
          {focusSupplierName && (
            <div className="flex items-center gap-1.5 mt-1">
              <Building2 className="w-3.5 h-3.5 text-primary" />
              <span className="text-xs text-primary font-medium">{focusSupplierName}</span>
            </div>
          )}
        </DialogHeader>
        {isLoading ? (
          <Skeleton className="h-56 w-full rounded-lg" />
        ) : chartData && chartData.length > 0 ? (
          <div className="flex flex-col min-h-0 gap-4">
            {/* Chart — fixed, always visible */}
            <div className="shrink-0">
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={chartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v) => `${v} zł`}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px",
                      fontSize: "12px",
                    }}
                    formatter={(value: number, _name, props) => [
                      formatPrice(value),
                      props.payload?.supplier,
                    ]}
                  />
                  <Line
                    type="monotone"
                    dataKey="price"
                    stroke="hsl(var(--primary))"
                    strokeWidth={2}
                    dot={{ fill: "hsl(var(--primary))", strokeWidth: 0, r: 4 }}
                    activeDot={{ r: 5 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
            {/* Table — scrollable, fills remaining space */}
            <div className="flex-1 min-h-0 overflow-y-auto border border-border rounded-lg">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-card z-10">
                  <tr className="border-b border-border">
                    <th className="text-left px-4 py-2.5 text-muted-foreground font-medium">Data</th>
                    <th className="text-left px-4 py-2.5 text-muted-foreground font-medium">Dostawca</th>
                    <th className="text-right px-4 py-2.5 text-muted-foreground font-medium">Cena</th>
                  </tr>
                </thead>
                <tbody>
                  {history?.slice().reverse().map((h, i) => (
                    <tr key={i} className="border-b border-border last:border-0 hover:bg-secondary/40 transition-colors">
                      <td className="px-4 py-2.5">{formatDate(h.date)}</td>
                      <td className="px-4 py-2.5 text-muted-foreground">{h.supplierName}</td>
                      <td className="px-4 py-2.5 text-right font-semibold">{formatPrice(h.price)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="text-center py-8 text-muted-foreground text-sm">
            Brak historii cen dla tego produktu.
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function SupplierComparisonModal({
  productId,
  productName,
  onClose,
}: {
  productId: number;
  productName: string;
  onClose: () => void;
}) {
  const { data, isLoading } = useGetProductSupplierComparison(productId, {
    query: { queryKey: getGetProductSupplierComparisonQueryKey(productId) },
  });

  // Build merged chart data for multi-line chart
  // Each date from any supplier becomes a row; each supplier is a column
  const chartData = (() => {
    if (!data || !data.suppliers.length) return [];
    const dateMap: Record<string, Record<string, number>> = {};
    data.suppliers.forEach((s) => {
      s.priceHistory.forEach((p) => {
        if (!dateMap[p.date]) dateMap[p.date] = {};
        dateMap[p.date][s.supplierName] = p.price;
      });
    });
    return Object.entries(dateMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, prices]) => ({ date: formatDate(date), ...prices }));
  })();

  const cheapestSupplier = data?.suppliers.reduce((best, s) =>
    s.latestPrice < best.latestPrice ? s : best,
    data.suppliers[0]
  );

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GitCompare className="w-5 h-5 text-primary" />
            Porównanie dostawców: {productName}
          </DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="space-y-4">
            <Skeleton className="h-48 w-full rounded-lg" />
            <div className="grid grid-cols-2 gap-3">
              <Skeleton className="h-36 rounded-lg" />
              <Skeleton className="h-36 rounded-lg" />
            </div>
          </div>
        ) : data && data.suppliers.length > 0 ? (
          <div className="space-y-6">
            {/* Supplier stat cards */}
            <div className={cn(
              "grid gap-3",
              data.suppliers.length === 1 ? "grid-cols-1" : "grid-cols-2"
            )}>
              {data.suppliers.map((s, i) => {
                const isCheapest = s.supplierId === cheapestSupplier?.supplierId && data.suppliers.length > 1;
                const color = SUPPLIER_COLORS[i % SUPPLIER_COLORS.length];
                return (
                  <div
                    key={s.supplierId}
                    className={cn(
                      "rounded-xl border p-4 relative overflow-hidden",
                      isCheapest ? "border-primary/50 bg-primary/5" : "border-border bg-card"
                    )}
                  >
                    {isCheapest && (
                      <div className="absolute top-3 right-3 flex items-center gap-1 text-xs font-semibold text-primary bg-primary/10 px-2 py-0.5 rounded-full">
                        <Trophy className="w-3 h-3" />
                        Najtańszy
                      </div>
                    )}
                    <div className="flex items-center gap-2 mb-3">
                      <div
                        className="w-3 h-3 rounded-full shrink-0"
                        style={{ background: color }}
                      />
                      <p className="text-sm font-semibold text-foreground leading-tight pr-16">{s.supplierName}</p>
                    </div>

                    <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                      <div>
                        <p className="text-xs text-muted-foreground">Ostatnia cena</p>
                        <p className="text-xl font-bold text-foreground">{formatPrice(s.latestPrice)}</p>
                        <p className="text-xs text-muted-foreground">/{data.unit}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Średnia cena</p>
                        <p className="text-base font-semibold text-foreground">{formatPrice(s.avgPrice)}</p>
                        <p className="text-xs text-muted-foreground">/{data.unit}</p>
                      </div>
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <TrendingDown className="w-3.5 h-3.5 text-emerald-500" />
                        Min: <span className="text-foreground font-medium">{formatPrice(s.minPrice)}</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <TrendingUp className="w-3.5 h-3.5 text-destructive" />
                        Max: <span className="text-foreground font-medium">{formatPrice(s.maxPrice)}</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <ShoppingCart className="w-3.5 h-3.5" />
                        Zakupów: <span className="text-foreground font-medium">{s.purchaseCount}</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Calendar className="w-3.5 h-3.5" />
                        <span>{formatDate(s.lastPurchaseDate)}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Price difference summary (only when >1 supplier) */}
            {data.suppliers.length > 1 && cheapestSupplier && (() => {
              const mostExpensive = data.suppliers.reduce((worst, s) =>
                s.latestPrice > worst.latestPrice ? s : worst, data.suppliers[0]
              );
              const diff = mostExpensive.latestPrice - cheapestSupplier.latestPrice;
              const diffPct = (diff / cheapestSupplier.latestPrice) * 100;
              return (
                <div className="bg-secondary/40 rounded-lg px-4 py-3 flex items-center justify-between gap-4">
                  <p className="text-sm text-muted-foreground">
                    Różnica cen między najtańszym a najdroższym dostawcą:
                  </p>
                  <div className="text-right shrink-0">
                    <span className="text-base font-bold text-destructive">+{formatPrice(diff)}</span>
                    <span className="text-xs text-muted-foreground ml-1">({diffPct.toFixed(1)}% drożej)</span>
                  </div>
                </div>
              );
            })()}

            {/* Multi-line price history chart */}
            {chartData.length > 0 && (
              <div>
                <p className="text-sm font-medium text-foreground mb-3">Historia cen</p>
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={chartData} margin={{ top: 4, right: 4, left: -16, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={(v) => `${v} zł`}
                    />
                    <Tooltip
                      contentStyle={{
                        background: "hsl(var(--card))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: "8px",
                        fontSize: "12px",
                      }}
                      formatter={(value: number) => [formatPrice(value)]}
                    />
                    {data.suppliers.length > 1 && (
                      <Legend
                        wrapperStyle={{ fontSize: "11px", paddingTop: "8px" }}
                        formatter={(value) => value.length > 30 ? value.substring(0, 30) + "…" : value}
                      />
                    )}
                    {data.suppliers.map((s, i) => (
                      <Line
                        key={s.supplierId}
                        type="monotone"
                        dataKey={s.supplierName}
                        stroke={SUPPLIER_COLORS[i % SUPPLIER_COLORS.length]}
                        strokeWidth={2}
                        dot={{ fill: SUPPLIER_COLORS[i % SUPPLIER_COLORS.length], strokeWidth: 0, r: 3 }}
                        activeDot={{ r: 5 }}
                        connectNulls
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Per-supplier transaction table */}
            {data.suppliers.length === 1 && (
              <div>
                <p className="text-sm font-medium text-foreground mb-2">Historia zakupów</p>
                <div className="border border-border rounded-lg overflow-hidden">
                  <div className="grid grid-cols-[1fr_auto] gap-4 px-4 py-2 text-xs font-medium text-muted-foreground bg-secondary/30">
                    <div>Data</div>
                    <div className="text-right w-28">Cena</div>
                  </div>
                  <div className="divide-y divide-border max-h-48 overflow-y-auto">
                    {[...data.suppliers[0].priceHistory].reverse().map((p, i) => (
                      <div key={i} className="grid grid-cols-[1fr_auto] gap-4 px-4 py-2 items-center">
                        <p className="text-sm text-muted-foreground">{formatDate(p.date)}</p>
                        <p className="text-sm font-semibold text-foreground text-right w-28">{formatPrice(p.price)}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="text-center py-8 text-muted-foreground text-sm">
            Brak danych dla tego produktu.
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function sortProducts<T extends { name: string; supplierName?: string | null; latestPrice?: number | null; priceChangePercent?: number | null; totalQuantity?: number | null }>(
  list: T[],
  sort: SortKey
): T[] {
  return [...list].sort((a, b) => {
    switch (sort) {
      case "name-asc":
        return a.name.localeCompare(b.name, "pl");
      case "name-desc":
        return b.name.localeCompare(a.name, "pl");
      case "price-desc":
        return (b.latestPrice ?? 0) - (a.latestPrice ?? 0);
      case "price-asc":
        return (a.latestPrice ?? 0) - (b.latestPrice ?? 0);
      case "change-desc":
        return Math.abs(b.priceChangePercent ?? 0) - Math.abs(a.priceChangePercent ?? 0);
      case "supplier-asc":
        return (a.supplierName ?? "").localeCompare(b.supplierName ?? "", "pl");
      case "quantity-desc":
        return (b.totalQuantity ?? 0) - (a.totalQuantity ?? 0);
      case "quantity-asc":
        return (a.totalQuantity ?? 0) - (b.totalQuantity ?? 0);
      default:
        return 0;
    }
  });
}

type ModalMode = "history" | "comparison";

function CreateCategoryModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (categoryId: string) => void;
}) {
  const queryClient = useQueryClient();
  const createMutation = useCreateCategory();
  const [label, setLabel] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = label.trim();
    if (trimmed.length < 2) {
      setError("Nazwa musi mieć co najmniej 2 znaki.");
      return;
    }
    setError(null);
    createMutation.mutate(
      { data: { label: trimmed } },
      {
        onSuccess: (data) => {
          queryClient.invalidateQueries({ queryKey: getListCategoriesQueryKey() });
          onCreated(data.id);
          onClose();
        },
        onError: (err: unknown) => {
          const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
          setError(msg ?? "Nie udało się utworzyć kategorii.");
        },
      },
    );
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-sm" onClick={(e) => e.stopPropagation()}>
        <DialogHeader>
          <DialogTitle>Nowa kategoria</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Input
              autoFocus
              placeholder="Nazwa kategorii, np. Dania gotowe"
              value={label}
              onChange={(e) => { setLabel(e.target.value); setError(null); }}
              maxLength={60}
              data-testid="input-new-category"
            />
            {error && <p className="text-xs text-destructive mt-1.5">{error}</p>}
          </div>
          <div className="flex gap-2 justify-end">
            <Button type="button" variant="outline" size="sm" onClick={onClose}>
              Anuluj
            </Button>
            <Button type="submit" size="sm" disabled={createMutation.isPending}>
              {createMutation.isPending ? "Tworzenie..." : "Utwórz"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function RenameCategoryModal({
  category,
  onClose,
}: {
  category: CategoryItem;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const renameMutation = useUpdateCategory();
  const [label, setLabel] = useState(category.label);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = label.trim();
    if (trimmed.length < 2) {
      setError("Nazwa musi mieć co najmniej 2 znaki.");
      return;
    }
    setError(null);
    renameMutation.mutate(
      { id: category.id, data: { label: trimmed } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListCategoriesQueryKey() });
          onClose();
        },
        onError: (err: unknown) => {
          const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
          setError(msg ?? "Nie udało się zmienić nazwy kategorii.");
        },
      },
    );
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-sm" onClick={(e) => e.stopPropagation()}>
        <DialogHeader>
          <DialogTitle>Zmień nazwę kategorii</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Input
              autoFocus
              placeholder="Nowa nazwa kategorii"
              value={label}
              onChange={(e) => { setLabel(e.target.value); setError(null); }}
              maxLength={60}
              data-testid="input-rename-category"
            />
            {error && <p className="text-xs text-destructive mt-1.5">{error}</p>}
          </div>
          <div className="flex gap-2 justify-end">
            <Button type="button" variant="outline" size="sm" onClick={onClose}>
              Anuluj
            </Button>
            <Button type="submit" size="sm" disabled={renameMutation.isPending}>
              {renameMutation.isPending ? "Zapisywanie..." : "Zapisz"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function CategoryBadge({
  productId,
  productName,
  category,
  categories,
  onChanged,
}: {
  productId: number;
  productName: string;
  category: string | null | undefined;
  categories: CategoryItem[] | undefined;
  onChanged: () => void;
}) {
  const queryClient = useQueryClient();
  const correctMutation = useCorrectProductCategory();
  const deleteMutation = useDeleteCategory();
  const [optimisticCategory, setOptimisticCategory] = useState<string | null | undefined>(category);
  const effectiveId = optimisticCategory ?? categorizeProduct(productName);
  const def = categories?.find((c) => c.id === effectiveId);
  const isAuto = optimisticCategory == null;
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [renameCategory, setRenameCategory] = useState<CategoryItem | null>(null);

  const handleSelect = (newCategoryId: string | null) => {
    // Optimistic update - change immediately
    setOptimisticCategory(newCategoryId);

    correctMutation.mutate(
      { id: productId, data: { category: newCategoryId ?? "inne" } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListProductsQueryKey() });
          onChanged();
        },
        onError: () => {
          // Rollback on error
          setOptimisticCategory(category);
        },
      },
    );
  };

  const handleDelete = (e: React.MouseEvent, catId: string) => {
    e.preventDefault();
    e.stopPropagation();
    deleteMutation.mutate(
      { id: catId },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListCategoriesQueryKey() });
          if (category === catId) {
            handleSelect(null);
          } else {
            onChanged();
          }
        },
      },
    );
  };

  const customCategories = categories?.filter((c) => c.isCustom) ?? [];
  const builtinCategories = categories?.filter((c) => !c.isCustom && c.id !== "inne") ?? [];

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
          <button
            className={cn(
              "inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-xs font-medium transition-colors",
              "bg-secondary text-muted-foreground hover:bg-secondary/80 hover:text-foreground",
              isAuto && "italic opacity-70",
            )}
            title={isAuto ? "Kategoria wykryta automatycznie — kliknij, aby zmienić" : "Zmień kategorię"}
            data-testid={`product-category-${productId}`}
          >
            {def ? (
              <>
                <span>{def.emoji}</span>
                <span>{def.label}</span>
              </>
            ) : (
              <span>Inne</span>
            )}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          className="max-h-80 overflow-y-auto w-52"
          onClick={(e) => e.stopPropagation()}
        >
          {builtinCategories.map((cat) => (
            <DropdownMenuItem
              key={cat.id}
              onSelect={() => handleSelect(cat.id)}
              className={cn(effectiveId === cat.id && "bg-secondary")}
            >
              <span className="mr-2">{cat.emoji}</span>
              {cat.label}
            </DropdownMenuItem>
          ))}
          <DropdownMenuItem
            onSelect={() => handleSelect("inne")}
            className={cn(effectiveId === "inne" && "bg-secondary")}
          >
            Inne
          </DropdownMenuItem>

          {customCategories.length > 0 && (
            <>
              <DropdownMenuSeparator />
              <p className="px-2 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
                Własne kategorie
              </p>
              {customCategories.map((cat) => (
                <DropdownMenuItem
                  key={cat.id}
                  onSelect={() => handleSelect(cat.id)}
                  className={cn("group flex items-center justify-between pr-1", effectiveId === cat.id && "bg-secondary")}
                >
                  <span className="flex items-center gap-2 flex-1 min-w-0">
                    <span>{cat.emoji}</span>
                    <span className="truncate">{cat.label}</span>
                  </span>
                  <span className="flex items-center gap-0.5 ml-2 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                    <button
                      className="p-1 rounded text-muted-foreground hover:text-primary hover:bg-primary/10"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setTimeout(() => setRenameCategory(cat), 0);
                      }}
                      title={`Zmień nazwę kategorii ${cat.label}`}
                      data-testid={`rename-category-${cat.id}`}
                    >
                      <Pencil className="w-3 h-3" />
                    </button>
                    <button
                      className="p-1 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                      onClick={(e) => handleDelete(e, cat.id)}
                      title={`Usuń kategorię ${cat.label}`}
                      data-testid={`delete-category-${cat.id}`}
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </span>
                </DropdownMenuItem>
              ))}
            </>
          )}

          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={() => {
              setTimeout(() => setShowCreateModal(true), 0);
            }}
            className="text-primary font-medium"
            data-testid="create-category-option"
          >
            <Plus className="w-3.5 h-3.5 mr-2" />
            Utwórz nową kategorię...
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => handleSelect(null)} className="text-muted-foreground text-xs">
            Wykryj automatycznie
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {showCreateModal && (
        <CreateCategoryModal
          onClose={() => setShowCreateModal(false)}
          onCreated={(newCatId) => handleSelect(newCatId)}
        />
      )}

      {renameCategory && (
        <RenameCategoryModal
          category={renameCategory}
          onClose={() => setRenameCategory(null)}
        />
      )}
    </>
  );
}

export default function Products() {
  const queryClient = useQueryClient();
  const { selectedId: costCenterSelectedId } = useCostCenter();
  const [month, setMonth] = useState(() => currentMonth());
  const [supplierFilter, setSupplierFilter] = useState<string>("all");
  const supplierId = supplierFilter !== "all" ? Number(supplierFilter) : undefined;
  const { data: products, isLoading, isError } = useListProducts({
    month,
    supplierId,
    ...(costCenterSelectedId !== null ? { costCenterId: costCenterSelectedId } : {}),
  });
  const { data: suppliers } = useListSuppliers();
  const { data: spendItems } = useGetCategorySpend({ month, ...(costCenterSelectedId !== null ? { costCenterId: costCenterSelectedId } : {}) });
  const { data: categories } = useListCategories();
  const [search, setSearch] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("search") || "";
  });
  const [sort, setSort] = useState<SortKey>(() => {
    const params = new URLSearchParams(window.location.search);
    return (params.get("sort") || "name-asc") as SortKey;
  });
  const [categoryFilter, setCategoryFilter] = useState<string>(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("category") || "all";
  });
  const [selectedProduct, setSelectedProduct] = useState<{ id: number; name: string } | null>(null);
  const [modalMode, setModalMode] = useState<ModalMode>("history");
  const [autoOpenId] = useState<number | null>(() => {
    const id = new URLSearchParams(window.location.search).get("id");
    return id ? parseInt(id, 10) : null;
  });
  const [showKeywordComparison, setShowKeywordComparison] = useState(false);
  const [showNeedsReview, setShowNeedsReview] = useState(false);
  const [categorySpendOpen, setCategorySpendOpen] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulkCategoryModalOpen, setBulkCategoryModalOpen] = useState(false);
  const [bulkCategorySelection, setBulkCategorySelection] = useState<string | null>(null);
  const bulkVerify = useBulkVerifyProducts();
  const bulkAssignCategory = useCorrectProductCategory();

  useEffect(() => {
    if (autoOpenId == null || !products) return;
    const product = products.find((p) => p.id === autoOpenId);
    if (product) {
      setSelectedProduct({ id: product.id, name: product.name });
      setModalMode("history");
    }
  }, [autoOpenId, products]);

  // Sync filters to URL
  useEffect(() => {
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (sort !== "name-asc") params.set("sort", sort);
    if (categoryFilter !== "all") params.set("category", categoryFilter);

    const newUrl = params.toString()
      ? `${window.location.pathname}?${params.toString()}`
      : window.location.pathname;

    window.history.replaceState({}, "", newUrl);
  }, [search, sort, categoryFilter]);

  const needsReviewCount = products?.filter((p) => p.needsReview === true).length ?? 0;

  function toggleSelect(id: number, e: React.MouseEvent) {
    e.stopPropagation();
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAllReviewable() {
    setSelectedIds(new Set(reviewableIds));
  }

  function clearSelection() {
    setSelectedIds(new Set());
  }

  const filtered = useMemo(() => {
    if (!products) return [];
    return sortProducts(
      products.filter((p) => {
        const matchesSearch = p.name.toLowerCase().includes(search.toLowerCase());
        const effectiveCategory = p.category ?? categorizeProduct(p.name);
        const matchesCategory = categoryFilter === "all" || effectiveCategory === categoryFilter;
        const matchesReview = !showNeedsReview || p.needsReview === true;
        return matchesSearch && matchesCategory && matchesReview;
      }),
      sort
    );
  }, [products, search, categoryFilter, showNeedsReview, sort]);

  const reviewableIds = useMemo(() =>
    filtered.filter((p) => p.needsReview === true).map((p) => p.id),
    [filtered]
  );

  async function handleBulkVerify() {
    const ids = Array.from(selectedIds);
    await bulkVerify.mutateAsync({ data: { ids } });
    clearSelection();
    queryClient.invalidateQueries({ queryKey: getListProductsQueryKey() });
  }

  async function handleBulkCategoryAssign() {
    if (!bulkCategorySelection) return;
    const ids = Array.from(selectedIds);
    try {
      await Promise.all(
        ids.map(id => {
          const product = products?.find(p => p.id === id);
          if (!product) return Promise.resolve();
          return bulkAssignCategory.mutateAsync({
            productId: id,
            data: { category: bulkCategorySelection }
          });
        })
      );
      setBulkCategoryModalOpen(false);
      setBulkCategorySelection(null);
      clearSelection();
      queryClient.invalidateQueries({ queryKey: getListProductsQueryKey() });
    } catch (error) {
      console.error("Failed to assign category:", error);
    }
  }

  // Compute which categories actually have products (search-filtered, before category filter)
  const categoryCountMap = useMemo(() => {
    if (!products) return {};
    const searchFiltered = products.filter((p) =>
      p.name.toLowerCase().includes(search.toLowerCase())
    );
    const map: Record<string, number> = {};
    for (const p of searchFiltered) {
      const cat = p.category ?? categorizeProduct(p.name);
      map[cat] = (map[cat] ?? 0) + 1;
    }
    return map;
  }, [products, search]);

  const searchFilteredCount = Object.values(categoryCountMap).reduce((sum, count) => sum + count, 0);

  const availableCategories = [
    ...(categories ?? []).filter((c) => c.id !== "inne" && (categoryCountMap[c.id] ?? 0) > 0),
    ...(categoryCountMap["inne"] ? [{ id: "inne", label: "Inne", emoji: "📦", isCustom: false }] : []),
  ];

  // Aggregate spending from API by effective category (explicit from DB or auto-detected by name)
  const categorySpend = useMemo(() => {
    if (!spendItems || spendItems.length === 0) return [];
    const map: Record<string, number> = {};
    for (const item of spendItems) {
      const catId = item.category ?? categorizeProduct(item.productName);
      map[catId] = (map[catId] ?? 0) + item.totalSpend;
    }
    const totalSpend = Object.values(map).reduce((s, v) => s + v, 0);
    const allCatDefs: Record<string, { label: string; emoji: string }> = Object.fromEntries(
      [...(categories ?? []), { id: "inne", label: "Inne", emoji: "📦", isCustom: false }].map((c) => [c.id, c])
    );
    return Object.entries(map)
      .map(([id, spend]) => ({
        id,
        label: allCatDefs[id]?.label ?? "Inne",
        emoji: allCatDefs[id]?.emoji ?? "📦",
        spend,
        pct: totalSpend > 0 ? (spend / totalSpend) * 100 : 0,
      }))
      .sort((a, b) => b.spend - a.spend);
  }, [spendItems, categories]);

  function openHistory(id: number, name: string) {
    setSelectedProduct({ id, name });
    setModalMode("history");
  }

  function openComparison(id: number, name: string, e: React.MouseEvent) {
    e.stopPropagation();
    setSelectedProduct({ id, name });
    setModalMode("comparison");
  }

  return (
    <Layout>
      <div className="px-4 py-5 md:px-8 md:py-8">
        <PageHeader
          title="Produkty"
          subtitle="Ceny surowców i historia zmian"
          action={<MonthNavigator month={month} onChange={setMonth} />}
        />

        {/* Category spend summary */}
        {categorySpend.length > 0 && (
          <div className="mb-6">
            <button
              onClick={() => setCategorySpendOpen((v) => !v)}
              className="flex items-center gap-2 mb-3 group"
            >
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Wydatki według kategorii</p>
              <ChevronDown className={cn(
                "w-3.5 h-3.5 text-muted-foreground/50 transition-transform duration-200",
                categorySpendOpen ? "rotate-0" : "-rotate-90"
              )} />
            </button>
            {categorySpendOpen && (
            <div>
            {/* Mobile: horizontal scroll strip */}
            <div className="md:hidden flex gap-3 overflow-x-auto scrollbar-none pb-1 -mx-4 px-4">
              {categorySpend.map((cat) => (
                <button
                  key={cat.id}
                  className={cn(
                    "text-left rounded-xl border p-3 transition-colors group shrink-0 w-32",
                    categoryFilter === cat.id
                      ? "border-primary/50 bg-primary/5"
                      : "border-border bg-card active:bg-secondary/40"
                  )}
                  onClick={() => setCategoryFilter(categoryFilter === cat.id ? "all" : cat.id)}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-base leading-none">{cat.emoji}</span>
                    <span className={cn(
                      "text-[11px] font-semibold tabular-nums",
                      categoryFilter === cat.id ? "text-primary" : "text-muted-foreground"
                    )}>
                      {cat.pct.toFixed(0)}%
                    </span>
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-tight mb-1 truncate">{cat.label}</p>
                  <p className={cn(
                    "text-sm font-bold tabular-nums leading-tight",
                    categoryFilter === cat.id ? "text-primary" : "text-foreground"
                  )}>
                    {formatPrice(cat.spend)}
                  </p>
                  <div className="mt-2 h-1 rounded-full bg-border overflow-hidden">
                    <div
                      className={cn(
                        "h-full rounded-full transition-all",
                        categoryFilter === cat.id ? "bg-primary" : "bg-primary/40"
                      )}
                      style={{ width: `${Math.max(cat.pct, 2)}%` }}
                    />
                  </div>
                </button>
              ))}
            </div>
            {/* Desktop: grid */}
            <div className="hidden md:grid grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
              {categorySpend.map((cat) => (
                <button
                  key={cat.id}
                  className={cn(
                    "text-left rounded-xl border p-3.5 transition-colors group",
                    categoryFilter === cat.id
                      ? "border-primary/50 bg-primary/5"
                      : "border-border bg-card hover:border-primary/30 hover:bg-primary/5"
                  )}
                  onClick={() => setCategoryFilter(categoryFilter === cat.id ? "all" : cat.id)}
                  title={`Kliknij, aby filtrować po kategorii ${cat.label}`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-base leading-none">{cat.emoji}</span>
                    <span className="text-xs font-semibold text-muted-foreground tabular-nums">
                      {cat.pct.toFixed(1)}%
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground leading-tight mb-1 truncate">{cat.label}</p>
                  <p className={cn(
                    "text-sm font-bold tabular-nums",
                    categoryFilter === cat.id ? "text-primary" : "text-foreground"
                  )}>
                    {formatPrice(cat.spend)}
                  </p>
                  <div className="mt-2.5 h-1 rounded-full bg-border overflow-hidden">
                    <div
                      className={cn(
                        "h-full rounded-full transition-all",
                        categoryFilter === cat.id ? "bg-primary" : "bg-primary/40 group-hover:bg-primary/60"
                      )}
                      style={{ width: `${Math.max(cat.pct, 2)}%` }}
                    />
                  </div>
                </button>
              ))}
            </div>
            </div>
            )}
          </div>
        )}

        {/* Filter bar */}
        <div className="mb-4 space-y-2">
          {/* Row 1: search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Szukaj produktu..."
              className="pl-9 w-full"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              data-testid="input-search-products"
            />
          </div>

          {/* Row 2: supplier chips — horizontal scroll */}
          {suppliers && suppliers.length > 0 && (
            <div className="flex gap-1.5 overflow-x-auto pb-0.5 scrollbar-none -mx-4 px-4" data-testid="supplier-chips">
              <button
                onClick={() => setSupplierFilter("all")}
                className={cn(
                  "shrink-0 inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium border transition-colors whitespace-nowrap",
                  supplierFilter === "all"
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-background text-muted-foreground border-border hover:border-primary/50 hover:text-foreground"
                )}
              >
                Wszyscy
              </button>
              {suppliers.map((s) => (
                <button
                  key={s.id}
                  onClick={() => setSupplierFilter(supplierFilter === String(s.id) ? "all" : String(s.id))}
                  className={cn(
                    "shrink-0 inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium border transition-colors whitespace-nowrap",
                    supplierFilter === String(s.id)
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-background text-muted-foreground border-border hover:border-primary/50 hover:text-foreground"
                  )}
                >
                  {s.name}
                </button>
              ))}
            </div>
          )}

          {/* Row 3: sort + review + compare */}
          <div className="flex gap-2 items-center">
            <Select value={sort} onValueChange={(v) => setSort(v as SortKey)}>
              <SelectTrigger className="flex-1 min-w-0 md:w-44 md:flex-none" data-testid="select-sort-products">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="name-asc">
                  <span className="flex items-center gap-2"><ArrowDownAZ className="w-3.5 h-3.5" />Nazwa A–Z</span>
                </SelectItem>
                <SelectItem value="name-desc">
                  <span className="flex items-center gap-2"><ArrowUpZA className="w-3.5 h-3.5" />Nazwa Z–A</span>
                </SelectItem>
                <SelectItem value="price-desc">
                  <span className="flex items-center gap-2"><PriceIcon className="w-3.5 h-3.5" />Największa cena</span>
                </SelectItem>
                <SelectItem value="price-asc">
                  <span className="flex items-center gap-2"><TrendingDown className="w-3.5 h-3.5" />Najniższa cena</span>
                </SelectItem>
                <SelectItem value="change-desc">
                  <span className="flex items-center gap-2"><TrendingUp className="w-3.5 h-3.5" />Największa zmiana %</span>
                </SelectItem>
                <SelectItem value="supplier-asc">
                  <span className="flex items-center gap-2"><Building2 className="w-3.5 h-3.5" />Dostawca A–Z</span>
                </SelectItem>
                <SelectItem value="quantity-desc">
                  <span className="flex items-center gap-2"><ShoppingCart className="w-3.5 h-3.5" />Ilość — od największej</span>
                </SelectItem>
                <SelectItem value="quantity-asc">
                  <span className="flex items-center gap-2"><ShoppingCart className="w-3.5 h-3.5" />Ilość — od najmniejszej</span>
                </SelectItem>
              </SelectContent>
            </Select>

            {needsReviewCount > 0 && (
              <>
                <Button
                  variant={showNeedsReview ? "default" : "outline"}
                  size="sm"
                  className={cn(
                    "shrink-0 gap-1.5 text-xs",
                    showNeedsReview
                      ? "bg-amber-500 hover:bg-amber-600 border-amber-500 text-white"
                      : "border-amber-300 text-amber-600 hover:bg-amber-50"
                  )}
                  onClick={() => { setShowNeedsReview((v) => !v); clearSelection(); }}
                  title="Produkty wymagające weryfikacji kategorii"
                >
                  <AlertTriangle className="w-3.5 h-3.5" />
                  Do weryfikacji
                  <span className={cn(
                    "inline-flex items-center justify-center rounded-full text-[10px] font-bold w-4 h-4",
                    showNeedsReview ? "bg-white/20 text-white" : "bg-amber-100 text-amber-700"
                  )}>
                    {needsReviewCount}
                  </span>
                </Button>
                {showNeedsReview && reviewableIds.length > 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="shrink-0 gap-1.5 text-xs border-amber-300 text-amber-600 hover:bg-amber-50"
                    onClick={selectedIds.size === reviewableIds.length ? clearSelection : selectAllReviewable}
                  >
                    <CheckSquare className="w-3.5 h-3.5" />
                    {selectedIds.size === reviewableIds.length ? "Odznacz wszystkie" : "Zaznacz wszystkie"}
                  </Button>
                )}
              </>
            )}

            <Button
              variant="outline"
              size="icon"
              className="shrink-0 text-primary border-primary/30 hover:bg-primary/5 hover:border-primary/50 md:hidden"
              onClick={() => setShowKeywordComparison(true)}
              title="Porównaj po frazie"
            >
              <Layers className="w-4 h-4" />
            </Button>
          </div>

          {/* Desktop only: clear + compare */}
          {(supplierFilter !== "all" || search || categoryFilter !== "all" || showNeedsReview) && (
            <button
              className="hidden md:inline text-xs text-muted-foreground hover:text-foreground underline underline-offset-2 transition-colors"
              onClick={() => { setSupplierFilter("all"); setSearch(""); setCategoryFilter("all"); setShowNeedsReview(false); }}
            >
              Wyczyść filtry
            </button>
          )}
          <div className="hidden md:flex ml-auto items-center gap-2">
            {filtered && filtered.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={() =>
                  exportToCsv(
                    [
                      ["Produkt", "Dostawca", "Jednostka", "Ostatnia cena (PLN)", "Poprzednia cena (PLN)", "Zmiana (%)"],
                      ...filtered.map((p) => [
                        p.name,
                        p.supplierName ?? "",
                        p.unit,
                        p.latestPrice ?? "",
                        p.previousPrice ?? "",
                        p.priceChangePercent ?? "",
                      ]),
                    ],
                    `produkty-${todaySlug()}.csv`,
                  )
                }
                data-testid="btn-export-csv-products"
              >
                <Download className="w-3.5 h-3.5" />
                Eksportuj CSV
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 text-primary border-primary/30 hover:bg-primary/5 hover:border-primary/50"
              onClick={() => setShowKeywordComparison(true)}
            >
              <Layers className="w-3.5 h-3.5" />
              Porównaj po frazie
            </Button>
          </div>
        </div>

        {/* Mobile: active filters strip + clear */}
        {(supplierFilter !== "all" || search || categoryFilter !== "all") && (
          <div className="md:hidden flex items-center gap-2 mb-3">
            <span className="text-xs text-muted-foreground">Aktywne filtry</span>
            <button
              className="text-xs text-primary underline underline-offset-2"
              onClick={() => { setSupplierFilter("all"); setSearch(""); setCategoryFilter("all"); }}
            >
              Wyczyść
            </button>
          </div>
        )}

        {/* Category filter pills — only shown when at least 2 categories exist */}
        {availableCategories.length >= 2 && (
          <div className="mb-4 flex gap-2 overflow-x-auto scrollbar-none -mx-4 px-4 md:mx-0 md:px-0 md:flex-wrap pb-1 md:pb-0">
            <button
              className={cn(
                "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-colors shrink-0",
                categoryFilter === "all"
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary text-muted-foreground hover:bg-secondary/80 hover:text-foreground"
              )}
              onClick={() => setCategoryFilter("all")}
            >
              Wszystkie
              <span className={cn(
                "text-xs rounded-full px-1.5 py-0.5 font-semibold",
                categoryFilter === "all" ? "bg-primary-foreground/20 text-primary-foreground" : "bg-border text-muted-foreground"
              )}>
                {searchFilteredCount}
              </span>
            </button>
            {availableCategories.map((cat) => (
              <button
                key={cat.id}
                className={cn(
                  "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-colors shrink-0",
                  categoryFilter === cat.id
                    ? "bg-primary text-primary-foreground"
                    : "bg-secondary text-muted-foreground hover:bg-secondary/80 hover:text-foreground"
                )}
                onClick={() => setCategoryFilter(categoryFilter === cat.id ? "all" : cat.id)}
              >
                <span>{cat.emoji}</span>
                <span>{cat.label}</span>
                <span className={cn(
                  "text-xs rounded-full px-1.5 py-0.5 font-semibold",
                  categoryFilter === cat.id ? "bg-primary-foreground/20 text-primary-foreground" : "bg-border text-muted-foreground"
                )}>
                  {categoryCountMap[cat.id] ?? 0}
                </span>
              </button>
            ))}
          </div>
        )}

        {/* Mobile card list */}
        <div className="md:hidden bg-card border border-border rounded-xl overflow-hidden">
          {isLoading ? (
            <div className="divide-y divide-border">
              {Array.from({ length: 7 }).map((_, i) => (
                <div key={i} className="px-4 py-4 flex items-center gap-3">
                  <Skeleton className="w-8 h-8 rounded-lg shrink-0" />
                  <div className="flex-1 space-y-1.5">
                    <Skeleton className="h-4 w-2/3" />
                    <Skeleton className="h-3 w-1/2" />
                  </div>
                  <div className="space-y-1.5 text-right shrink-0">
                    <Skeleton className="h-4 w-20 ml-auto" />
                    <Skeleton className="h-3.5 w-12 ml-auto" />
                  </div>
                </div>
              ))}
            </div>
          ) : isError ? (
            <div className="px-4 py-8 text-center text-sm text-destructive">
              Nie udało się załadować produktów.
            </div>
          ) : filtered && filtered.length > 0 ? (
            <div className="divide-y divide-border">
              {filtered.map((product) => {
                const hasMultipleSuppliers = (product.supplierCount ?? 1) > 1;
                const effectiveCatId = product.category ?? categorizeProduct(product.name);
                const catDef = categories?.find((c) => c.id === effectiveCatId);

                return (
                  <div
                    key={product.id}
                    className="flex items-center gap-3 px-4 py-4 active:bg-secondary/40 cursor-pointer"
                    onClick={(e) => showNeedsReview && product.needsReview ? toggleSelect(product.id, e) : openHistory(product.id, product.name)}
                    data-testid={`product-row-${product.id}`}
                  >
                    {/* Checkbox (only in review mode) */}
                    {showNeedsReview && product.needsReview && (
                      <div
                        className="shrink-0"
                        onClick={(e) => toggleSelect(product.id, e)}
                      >
                        <Checkbox
                          checked={selectedIds.has(product.id)}
                          onCheckedChange={() => {}}
                          className="border-amber-400 data-[state=checked]:bg-amber-500 data-[state=checked]:border-amber-500"
                        />
                      </div>
                    )}
                    {/* Category icon */}
                    <div className="w-9 h-9 rounded-lg bg-secondary flex items-center justify-center text-base shrink-0 select-none">
                      {catDef ? catDef.emoji : "📦"}
                    </div>

                    {/* Name + meta */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <p className="text-sm font-medium text-foreground leading-snug truncate">{product.name}</p>
                        {product.needsReview && (
                          <span className="inline-flex items-center gap-0.5 shrink-0 px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-amber-100 text-amber-700">
                            <AlertTriangle className="w-2.5 h-2.5" />
                            Do weryfikacji
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                        <p className="text-xs text-muted-foreground truncate max-w-[140px]">
                          {product.supplierName ?? "Brak dostawcy"}
                        </p>
                        <span className="text-xs text-muted-foreground">·</span>
                        <p className="text-xs text-muted-foreground shrink-0">{product.unit}</p>
                        {product.subcategory && (
                          <span className="text-[10px] text-muted-foreground/70 truncate max-w-[120px]">· {product.subcategory}</span>
                        )}
                        {hasMultipleSuppliers && (
                          <span className="inline-flex items-center gap-0.5 text-[10px] font-medium text-primary bg-primary/10 px-1.5 py-0.5 rounded-full shrink-0">
                            <GitCompare className="w-2.5 h-2.5" />
                            {product.supplierCount}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        {product.lastPurchaseDate && (
                          <p className="text-[11px] text-muted-foreground/70">
                            {formatDate(product.lastPurchaseDate)}
                          </p>
                        )}
                        {product.totalQuantity != null && product.totalQuantity > 0 && (
                          <>
                            {product.lastPurchaseDate && <span className="text-[11px] text-muted-foreground/50">·</span>}
                            <p className="text-[11px] text-muted-foreground/70">
                              {new Intl.NumberFormat("pl-PL", { maximumFractionDigits: 2 }).format(product.totalQuantity)}{" "}{product.unit}
                            </p>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Price + change + compare action */}
                    <div className="shrink-0 flex flex-col items-end gap-1">
                      <p className="text-sm font-bold text-foreground tabular-nums">
                        {product.latestPrice != null ? formatPrice(product.latestPrice) : "—"}
                      </p>
                      <PriceChangeBadge change={product.priceChangePercent} />
                      {hasMultipleSuppliers && (
                        <button
                          className="mt-0.5 text-[11px] font-medium text-primary flex items-center gap-0.5 active:opacity-70"
                          onClick={(e) => openComparison(product.id, product.name, e)}
                        >
                          <GitCompare className="w-3 h-3" />
                          Porównaj
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="py-12 text-center px-4">
              <Package className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">
                {search || supplierFilter !== "all" || categoryFilter !== "all"
                  ? "Nie znaleziono produktów pasujących do filtrów."
                  : "Brak produktów. Zaimportuj faktury, aby zobaczyć produkty."}
              </p>
            </div>
          )}
          {!isLoading && filtered && filtered.length > 0 && (
            <div className="px-4 py-3 border-t border-border bg-secondary/20 flex items-center justify-between">
              <p className="text-xs text-muted-foreground">{filtered.length} produktów</p>
              <button
                className="text-xs font-medium text-primary flex items-center gap-1 active:opacity-70"
                onClick={() => setShowKeywordComparison(true)}
              >
                <Layers className="w-3.5 h-3.5" />
                Porównaj po frazie
              </button>
            </div>
          )}
        </div>

        {/* Desktop table */}
        <div className="hidden md:block bg-card border border-border rounded-xl overflow-x-auto">
          <div className="grid grid-cols-[1fr_auto_auto_auto_auto_auto_auto] gap-4 px-6 min-w-[860px] py-3 border-b border-border text-xs font-medium text-muted-foreground bg-secondary/30">
            <div>Produkt</div>
            <div className="text-right w-28">Ostatnia cena</div>
            <div className="text-right w-28">Poprzednia</div>
            <div className="text-right w-24">Zmiana</div>
            <div className="text-right w-28">
              <div>Ilość</div>
              <div className="text-[10px] font-normal text-muted-foreground/70">miesiąc</div>
            </div>
            <div className="text-right w-32">Ostatni zakup</div>
            <div className="w-24" />
          </div>

          {isLoading ? (
            <div className="divide-y divide-border">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="grid grid-cols-[1fr_auto_auto_auto_auto_auto_auto] gap-4 px-6 min-w-[860px] py-4">
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-4 w-16" />
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-4 w-20" />
                </div>
              ))}
            </div>
          ) : isError ? (
            <div className="px-6 py-8 text-center text-sm text-destructive">
              Nie udało się załadować produktów. Odśwież stronę lub spróbuj ponownie później.
            </div>
          ) : filtered && filtered.length > 0 ? (
            <div className="divide-y divide-border">
              {filtered.map((product) => {
                const hasMultipleSuppliers = (product.supplierCount ?? 1) > 1;
                return (
                  <div
                    key={product.id}
                    className={cn(
                      "grid gap-4 px-6 min-w-[860px] py-4 hover:bg-secondary/40 transition-colors items-center cursor-pointer",
                      showNeedsReview && product.needsReview
                        ? "grid-cols-[auto_1fr_auto_auto_auto_auto_auto_auto]"
                        : "grid-cols-[1fr_auto_auto_auto_auto_auto_auto]",
                    )}
                    onClick={(e) => showNeedsReview && product.needsReview ? toggleSelect(product.id, e) : openHistory(product.id, product.name)}
                    data-testid={`product-row-${product.id}`}
                  >
                    {showNeedsReview && product.needsReview && (
                      <div onClick={(e) => toggleSelect(product.id, e)}>
                        <Checkbox
                          checked={selectedIds.has(product.id)}
                          onCheckedChange={() => {}}
                          className="border-amber-400 data-[state=checked]:bg-amber-500 data-[state=checked]:border-amber-500"
                        />
                      </div>
                    )}
                    <div>
                      <div className="flex items-center gap-1.5">
                        <p className="text-sm font-medium text-foreground">{product.name}</p>
                        {product.needsReview && (
                          <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-amber-100 text-amber-700">
                            <AlertTriangle className="w-2.5 h-2.5" />
                            Do weryfikacji
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                        <p className="text-xs text-muted-foreground">
                          {product.supplierName ?? "Brak dostawcy"} · {product.unit}
                          {product.subcategory ? ` · ${product.subcategory}` : ""}
                        </p>
                        <CategoryBadge
                          productId={product.id}
                          productName={product.name}
                          category={product.category}
                          categories={categories}
                          onChanged={() => queryClient.invalidateQueries()}
                        />
                        {hasMultipleSuppliers && (
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-primary bg-primary/10 px-1.5 py-0.5 rounded-full">
                            <GitCompare className="w-2.5 h-2.5" />
                            {product.supplierCount} dostawców
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="text-right w-28">
                      <p className="text-sm font-semibold text-foreground">
                        {product.latestPrice != null ? `${formatPrice(product.latestPrice)}` : "—"}
                      </p>
                      <p className="text-xs text-muted-foreground">/{product.unit}</p>
                    </div>
                    <div className="text-right w-28">
                      <p className="text-sm text-muted-foreground">
                        {product.previousPrice != null ? formatPrice(product.previousPrice) : "—"}
                      </p>
                    </div>
                    <div className="text-right w-24">
                      <PriceChangeBadge change={product.priceChangePercent} />
                    </div>
                    <div className="text-right w-28">
                      {product.totalQuantity != null && product.totalQuantity > 0 ? (
                        <>
                          <p className="text-sm font-semibold text-foreground tabular-nums">
                            {new Intl.NumberFormat("pl-PL", { maximumFractionDigits: 2 }).format(product.totalQuantity)}
                          </p>
                          <p className="text-xs text-muted-foreground">{product.unit}</p>
                        </>
                      ) : (
                        <p className="text-sm text-muted-foreground">—</p>
                      )}
                    </div>
                    <div className="text-right w-32">
                      <p className="text-xs text-muted-foreground">{formatDate(product.lastPurchaseDate)}</p>
                    </div>
                    <div className="w-24 flex justify-end">
                      <Button
                        variant={hasMultipleSuppliers ? "default" : "ghost"}
                        size="sm"
                        className={cn(
                          "h-7 text-xs gap-1",
                          hasMultipleSuppliers
                            ? "bg-primary/10 text-primary hover:bg-primary/20 border-0 shadow-none"
                            : "text-muted-foreground"
                        )}
                        onClick={(e) => openComparison(product.id, product.name, e)}
                        title="Porównaj dostawców"
                      >
                        <GitCompare className="w-3 h-3" />
                        {hasMultipleSuppliers ? "Porównaj" : "Cennik"}
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="py-12 text-center">
              <Package className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">
                {search || supplierFilter !== "all"
                  ? "Nie znaleziono produktów pasujących do filtrów."
                  : "Brak produktów. Zaimportuj faktury, aby zobaczyć produkty."}
              </p>
            </div>
          )}
        </div>

        {/* Floating bulk action bar */}
        {selectedIds.size > 0 && (
          <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-5 py-3 rounded-2xl shadow-2xl border border-amber-400/30 bg-background/95 backdrop-blur-sm">
            <span className="text-sm font-medium text-amber-700">
              Zaznaczono: {selectedIds.size}
            </span>
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5"
              onClick={() => setBulkCategoryModalOpen(true)}
            >
              <Layers className="w-4 h-4" />
              Przypisz kategorię
            </Button>
            <Button
              size="sm"
              className="gap-1.5 bg-amber-500 hover:bg-amber-600 text-white border-0"
              onClick={handleBulkVerify}
              disabled={bulkVerify.isPending}
            >
              <CheckCheck className="w-4 h-4" />
              Zweryfikuj zaznaczone
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="text-muted-foreground hover:text-foreground"
              onClick={clearSelection}
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
        )}

        {selectedProduct && modalMode === "history" && (
          <PriceHistoryModal
            productId={selectedProduct.id}
            productName={selectedProduct.name}
            onClose={() => setSelectedProduct(null)}
          />
        )}

        {selectedProduct && modalMode === "comparison" && (
          <SupplierComparisonModal
            productId={selectedProduct.id}
            productName={selectedProduct.name}
            onClose={() => setSelectedProduct(null)}
          />
        )}

        {showKeywordComparison && (
          <KeywordComparisonModal
            products={products ?? []}
            onClose={() => setShowKeywordComparison(false)}
          />
        )}

        {/* Bulk category assignment modal */}
        <Dialog open={bulkCategoryModalOpen} onOpenChange={setBulkCategoryModalOpen}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Layers className="w-5 h-5 text-primary" />
                Przypisz kategorię
              </DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground mb-4">
              Przypisz wybraną kategorię do {selectedIds.size} zaznaczonych produktów
            </p>
            <div className="grid grid-cols-2 gap-2 max-h-64 overflow-y-auto">
              {(categories ?? []).map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => setBulkCategorySelection(cat.id)}
                  className={cn(
                    "p-3 rounded-lg border-2 transition-colors text-left text-sm",
                    bulkCategorySelection === cat.id
                      ? "border-primary bg-primary/10"
                      : "border-border hover:border-primary/50"
                  )}
                >
                  <span className="text-lg mr-1">{cat.emoji}</span>
                  <span className="font-medium">{cat.label}</span>
                </button>
              ))}
            </div>
            <div className="flex gap-2 justify-end pt-4">
              <Button variant="outline" onClick={() => setBulkCategoryModalOpen(false)}>
                Anuluj
              </Button>
              <Button
                onClick={handleBulkCategoryAssign}
                disabled={!bulkCategorySelection || bulkAssignCategory.isPending}
              >
                Przypisz
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}
