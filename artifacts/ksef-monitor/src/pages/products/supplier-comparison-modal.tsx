import { useGetProductSupplierComparison, getGetProductSupplierComparisonQueryKey } from "@workspace/api-client-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { Calendar, GitCompare, ShoppingCart, TrendingDown, TrendingUp, Trophy } from "lucide-react";
import { formatPrice, formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { SUPPLIER_COLORS } from "./shared";

export function SupplierComparisonModal({
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

