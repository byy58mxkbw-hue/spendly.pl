import { useState } from "react";
import { Layout, PageHeader } from "@/components/layout";
import { useQueryClient } from "@tanstack/react-query";
import {
  useListProducts,
  useListSuppliers,
  useGetProductPriceHistory,
  useGetProductSupplierComparison,
  useUpdateProduct,
  getGetProductPriceHistoryQueryKey,
  getGetProductSupplierComparisonQueryKey,
} from "@workspace/api-client-react";
import { CATEGORIES, categorizeProduct } from "@/lib/categories";
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
} from "lucide-react";
import { formatPrice, formatPercent, formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

type ProductItem = {
  id: number;
  name: string;
  unit: string;
  latestPrice?: number | null;
  supplierName?: string | null;
  supplierId?: number | null;
  lastPurchaseDate?: string | null;
  priceChangePercent?: number | null;
  supplierCount?: number;
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

  const supplierGroups = Object.values(bySupplier).sort(
    (a, b) => {
      const aMin = Math.min(...a.products.map((p) => p.latestPrice ?? Infinity));
      const bMin = Math.min(...b.products.map((p) => p.latestPrice ?? Infinity));
      return aMin - bMin;
    }
  );

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
              const groupMinPrice = Math.min(...group.products.map((p) => p.latestPrice ?? Infinity));
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
                                {p.unit} · ostatni zakup: {formatDate(p.lastPurchaseDate)}
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

type SortKey = "name-asc" | "name-desc" | "price-desc" | "price-asc" | "change-desc" | "supplier-asc";

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

export function PriceHistoryModal({ productId, productName, onClose }: { productId: number; productName: string; onClose: () => void }) {
  const { data: history, isLoading } = useGetProductPriceHistory(productId, undefined, {
    query: { enabled: true, queryKey: getGetProductPriceHistoryQueryKey(productId) },
  });

  const chartData = history?.map((h) => ({
    date: formatDate(h.date),
    price: h.price,
    supplier: h.supplierName,
  }));

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl" data-testid="dialog-price-history">
        <DialogHeader>
          <DialogTitle>Historia cen: {productName}</DialogTitle>
        </DialogHeader>
        {isLoading ? (
          <Skeleton className="h-56 w-full rounded-lg" />
        ) : chartData && chartData.length > 0 ? (
          <>
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
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-2 text-muted-foreground font-medium">Data</th>
                    <th className="text-left py-2 text-muted-foreground font-medium">Dostawca</th>
                    <th className="text-right py-2 text-muted-foreground font-medium">Cena</th>
                  </tr>
                </thead>
                <tbody>
                  {[...history!].reverse().map((h, i) => (
                    <tr key={i} className="border-b border-border last:border-0">
                      <td className="py-2">{formatDate(h.date)}</td>
                      <td className="py-2 text-muted-foreground">{h.supplierName}</td>
                      <td className="py-2 text-right font-semibold">{formatPrice(h.price)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
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

function sortProducts<T extends { name: string; supplierName?: string | null; latestPrice?: number | null; priceChangePercent?: number | null }>(
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
      default:
        return 0;
    }
  });
}

type ModalMode = "history" | "comparison";

function CategoryBadge({
  productId,
  productName,
  category,
  onChanged,
}: {
  productId: number;
  productName: string;
  category: string | null | undefined;
  onChanged: () => void;
}) {
  const updateMutation = useUpdateProduct();
  const effectiveId = category ?? categorizeProduct(productName);
  const def = CATEGORIES.find((c) => c.id === effectiveId);
  const isAuto = category == null;

  const handleSelect = (newCategoryId: string | null) => {
    updateMutation.mutate(
      { id: productId, data: { category: newCategoryId } },
      { onSuccess: () => onChanged() },
    );
  };

  return (
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
        className="max-h-80 overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {CATEGORIES.map((cat) => (
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
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => handleSelect(null)} className="text-muted-foreground text-xs">
          Wykryj automatycznie
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export default function Products() {
  const queryClient = useQueryClient();
  const { data: products, isLoading } = useListProducts();
  const { data: suppliers } = useListSuppliers();
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortKey>("name-asc");
  const [supplierFilter, setSupplierFilter] = useState<string>("all");
  const [selectedProduct, setSelectedProduct] = useState<{ id: number; name: string } | null>(null);
  const [modalMode, setModalMode] = useState<ModalMode>("history");
  const [showKeywordComparison, setShowKeywordComparison] = useState(false);

  const filtered = sortProducts(
    products?.filter((p) => {
      const matchesSearch = p.name.toLowerCase().includes(search.toLowerCase());
      const matchesSupplier = supplierFilter === "all" || p.supplierName === supplierFilter;
      return matchesSearch && matchesSupplier;
    }) ?? [],
    sort
  );

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
        />

        <div className="mb-6 flex gap-3 items-center flex-wrap">
          <div className="relative max-w-sm flex-1 min-w-48">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Szukaj produktu..."
              className="pl-9"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              data-testid="input-search-products"
            />
          </div>

          <Select value={supplierFilter} onValueChange={setSupplierFilter}>
            <SelectTrigger className="w-52" data-testid="select-filter-supplier">
              <Building2 className="w-3.5 h-3.5 text-muted-foreground mr-1" />
              <SelectValue placeholder="Wszyscy dostawcy" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Wszyscy dostawcy</SelectItem>
              {suppliers?.map((s) => (
                <SelectItem key={s.id} value={s.name}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={sort} onValueChange={(v) => setSort(v as SortKey)}>
            <SelectTrigger className="w-48" data-testid="select-sort-products">
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
            </SelectContent>
          </Select>

          {(supplierFilter !== "all" || search) && (
            <button
              className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2 transition-colors"
              onClick={() => { setSupplierFilter("all"); setSearch(""); }}
            >
              Wyczyść filtry
            </button>
          )}

          <Button
            variant="outline"
            size="sm"
            className="ml-auto gap-1.5 text-primary border-primary/30 hover:bg-primary/5 hover:border-primary/50"
            onClick={() => setShowKeywordComparison(true)}
          >
            <Layers className="w-3.5 h-3.5" />
            Porównaj po frazie
          </Button>
        </div>

        <div className="bg-card border border-border rounded-xl overflow-x-auto">
          <div className="grid grid-cols-[1fr_auto_auto_auto_auto_auto] gap-4 px-4 md:px-6 min-w-[760px] py-3 border-b border-border text-xs font-medium text-muted-foreground bg-secondary/30">
            <div>Produkt</div>
            <div className="text-right w-28">Ostatnia cena</div>
            <div className="text-right w-28">Poprzednia</div>
            <div className="text-right w-24">Zmiana</div>
            <div className="text-right w-32">Ostatni zakup</div>
            <div className="w-24" />
          </div>

          {isLoading ? (
            <div className="divide-y divide-border">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="grid grid-cols-[1fr_auto_auto_auto_auto_auto] gap-4 px-4 md:px-6 min-w-[760px] py-4">
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-4 w-16" />
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-4 w-20" />
                </div>
              ))}
            </div>
          ) : filtered && filtered.length > 0 ? (
            <div className="divide-y divide-border">
              {filtered.map((product) => {
                const hasMultipleSuppliers = (product.supplierCount ?? 1) > 1;
                return (
                  <div
                    key={product.id}
                    className="grid grid-cols-[1fr_auto_auto_auto_auto_auto] gap-4 px-4 md:px-6 min-w-[760px] py-4 hover:bg-secondary/40 transition-colors items-center cursor-pointer"
                    onClick={() => openHistory(product.id, product.name)}
                    data-testid={`product-row-${product.id}`}
                  >
                    <div>
                      <p className="text-sm font-medium text-foreground">{product.name}</p>
                      <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                        <p className="text-xs text-muted-foreground">{product.supplierName ?? "Brak dostawcy"} · {product.unit}</p>
                        <CategoryBadge
                          productId={product.id}
                          productName={product.name}
                          category={product.category}
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
      </div>
    </Layout>
  );
}
