import { useState } from "react";
import { Layout, PageHeader } from "@/components/layout";
import {
  useListProducts,
  useGetProductPriceHistory,
  getGetProductPriceHistoryQueryKey,
} from "@workspace/api-client-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { Search, TrendingUp, TrendingDown, Minus, Package } from "lucide-react";
import { formatPrice, formatPercent, formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

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

function PriceHistoryModal({ productId, productName, onClose }: { productId: number; productName: string; onClose: () => void }) {
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

export default function Products() {
  const { data: products, isLoading } = useListProducts();
  const [search, setSearch] = useState("");
  const [selectedProduct, setSelectedProduct] = useState<{ id: number; name: string } | null>(null);

  const filtered = products?.filter((p) =>
    p.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <Layout>
      <div className="px-8 py-8">
        <PageHeader
          title="Produkty"
          subtitle="Ceny surowców i historia zmian"
        />

        <div className="mb-6 relative max-w-sm">
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

        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-4 px-6 py-3 border-b border-border text-xs font-medium text-muted-foreground bg-secondary/30">
            <div>Produkt</div>
            <div className="text-right w-28">Ostatnia cena</div>
            <div className="text-right w-28">Poprzednia</div>
            <div className="text-right w-24">Zmiana</div>
            <div className="text-right w-32">Ostatni zakup</div>
          </div>

          {isLoading ? (
            <div className="divide-y divide-border">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-4 px-6 py-4">
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-4 w-16" />
                  <Skeleton className="h-4 w-24" />
                </div>
              ))}
            </div>
          ) : filtered && filtered.length > 0 ? (
            <div className="divide-y divide-border">
              {filtered.map((product) => (
                <button
                  key={product.id}
                  className="w-full grid grid-cols-[1fr_auto_auto_auto_auto] gap-4 px-6 py-4 hover:bg-secondary/40 transition-colors text-left items-center"
                  onClick={() => setSelectedProduct({ id: product.id, name: product.name })}
                  data-testid={`product-row-${product.id}`}
                >
                  <div>
                    <p className="text-sm font-medium text-foreground">{product.name}</p>
                    <p className="text-xs text-muted-foreground">{product.supplierName ?? "Brak dostawcy"} · {product.unit}</p>
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
                </button>
              ))}
            </div>
          ) : (
            <div className="py-12 text-center">
              <Package className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">
                {search ? "Nie znaleziono produktów." : "Brak produktów. Zaimportuj faktury, aby zobaczyć produkty."}
              </p>
            </div>
          )}
        </div>

        {selectedProduct && (
          <PriceHistoryModal
            productId={selectedProduct.id}
            productName={selectedProduct.name}
            onClose={() => setSelectedProduct(null)}
          />
        )}
      </div>
    </Layout>
  );
}
