import { useGetProductPriceHistory, getGetProductPriceHistoryQueryKey } from "@workspace/api-client-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { Building2 } from "lucide-react";
import { formatPrice, formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

export function PriceHistoryModal({
  productId,
  productName,
  onClose,
  focusSupplierId,
  focusSupplierName,
  onSelectInvoice,
}: {
  productId: number;
  productName: string;
  onClose: () => void;
  focusSupplierId?: number;
  focusSupplierName?: string;
  /** When provided, history rows link to their source invoice. */
  onSelectInvoice?: (invoiceId: number) => void;
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

  // Cheapest supplier — each supplier's most recent price, then the lowest.
  const latestBySupplier = new Map<number, { name: string; price: number; date: string }>();
  for (const h of history ?? []) {
    const prev = latestBySupplier.get(h.supplierId);
    if (!prev || h.date > prev.date) latestBySupplier.set(h.supplierId, { name: h.supplierName, price: h.price, date: h.date });
  }
  const supplierPrices = [...latestBySupplier.values()];
  const cheapest = supplierPrices.length > 1
    ? supplierPrices.reduce((min, s) => (s.price < min.price ? s : min), supplierPrices[0])
    : null;
  const priciest = cheapest ? supplierPrices.reduce((max, s) => (s.price > max.price ? s : max), supplierPrices[0]) : null;

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
            {cheapest && (
              <div className="shrink-0 flex items-center gap-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 flex-wrap">
                <Building2 className="w-4 h-4 text-primary shrink-0" />
                <span className="text-xs text-muted-foreground">Najtaniej u</span>
                <span className="text-sm font-semibold text-foreground">{cheapest.name}</span>
                <span className="text-sm font-bold text-primary tabular-nums">{formatPrice(cheapest.price)}</span>
                {priciest && priciest.price > cheapest.price && (
                  <span className="ml-auto text-[11px] text-emerald-600 font-medium">
                    taniej o {formatPrice(priciest.price - cheapest.price)} niż {priciest.name}
                  </span>
                )}
              </div>
            )}
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
                    <tr
                      key={i}
                      onClick={onSelectInvoice ? () => onSelectInvoice(h.invoiceId) : undefined}
                      className={cn(
                        "border-b border-border last:border-0 hover:bg-secondary/40 transition-colors",
                        onSelectInvoice && "cursor-pointer",
                      )}
                      title={onSelectInvoice ? `Otwórz fakturę ${h.invoiceNumber}` : undefined}
                    >
                      <td className="px-4 py-2.5">{formatDate(h.date)}</td>
                      <td className="px-4 py-2.5 text-muted-foreground">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className="truncate">{h.supplierName}</span>
                          {onSelectInvoice && (
                            <span className="text-[10px] text-primary/70 truncate shrink-0">· {h.invoiceNumber}</span>
                          )}
                        </div>
                      </td>
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

