import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { Layout, PageHeader } from "@/components/layout";
import {
  useGetSupplier,
  useListInvoices,
  useGetSupplierMonthlySpend,
  useGetSupplierTopProducts,
  getGetSupplierQueryKey,
  getListInvoicesQueryKey,
  getGetSupplierMonthlySpendQueryKey,
  getGetSupplierTopProductsQueryKey,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/error-state";
import { ArrowLeft, Building2, Mail, Phone, FileText, Package } from "lucide-react";
import { formatPrice, formatDate } from "@/lib/format";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { PriceHistoryModal } from "./products";

type TopProduct = {
  productId?: number | null;
  productName: string;
  unit: string;
  latestPrice: number;
  totalSpend: number;
  purchaseCount: number;
};

function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ value: number }>; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-card border border-border rounded-lg px-3 py-2 shadow-lg text-xs">
      <p className="text-muted-foreground mb-1 font-medium">{label}</p>
      <p className="text-foreground font-bold">{formatPrice(payload[0]?.value ?? 0)}</p>
    </div>
  );
}

export default function SupplierDetail({ params }: { params: { id: string } }) {
  const [, setLocation] = useLocation();
  const id = parseInt(params.id, 10);
  const [selectedProduct, setSelectedProduct] = useState<{ id: number; name: string } | null>(null);

  const { data: supplier, isLoading: supplierLoading, isError: supplierError, refetch: refetchSupplier } = useGetSupplier(id, {
    query: { enabled: !!id, queryKey: getGetSupplierQueryKey(id) },
  });
  const { data: invoices, isLoading: invoicesLoading } = useListInvoices(
    { supplierId: id },
    { query: { enabled: !!id, queryKey: getListInvoicesQueryKey({ supplierId: id }) } }
  );
  const { data: monthlyRaw, isLoading: monthlyLoading } = useGetSupplierMonthlySpend(
    id,
    { months: 12 },
    { query: { enabled: !!id, queryKey: getGetSupplierMonthlySpendQueryKey(id, { months: 12 }) } }
  );
  const { data: topProducts, isLoading: topProductsLoading } = useGetSupplierTopProducts(
    id,
    { limit: 5 },
    { query: { enabled: !!id, queryKey: getGetSupplierTopProductsQueryKey(id, { limit: 5 }) } }
  );

  const chartData = useMemo(() => {
    if (!monthlyRaw) return [];
    return [...monthlyRaw].reverse();
  }, [monthlyRaw]);

  return (
    <Layout>
      <div className="px-4 py-5 md:px-8 md:py-8">
        <Button
          variant="ghost"
          size="sm"
          className="gap-2 mb-6 -ml-2 text-muted-foreground"
          onClick={() => setLocation("/suppliers")}
          data-testid="btn-back"
        >
          <ArrowLeft className="w-4 h-4" /> Dostawcy
        </Button>

        {supplierLoading ? (
          <div className="space-y-4">
            <Skeleton className="h-8 w-64" />
            <Skeleton className="h-4 w-48" />
          </div>
        ) : supplierError ? (
          <ErrorState onRetry={() => refetchSupplier()} />
        ) : supplier ? (
          <>
            <PageHeader title={supplier.name} subtitle={`NIP: ${supplier.taxId}`} />

            {/* ── Stats + Contact row ── */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
              <div className="glass rounded-xl p-6">
                <h3 className="text-sm font-medium text-muted-foreground mb-4">Informacje kontaktowe</h3>
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-sm">
                    <Building2 className="w-4 h-4 text-muted-foreground" />
                    <span>{supplier.name}</span>
                  </div>
                  {supplier.email && (
                    <div className="flex items-center gap-2 text-sm">
                      <Mail className="w-4 h-4 text-muted-foreground" />
                      <span>{supplier.email}</span>
                    </div>
                  )}
                  {supplier.phone && (
                    <div className="flex items-center gap-2 text-sm">
                      <Phone className="w-4 h-4 text-muted-foreground" />
                      <span>{supplier.phone}</span>
                    </div>
                  )}
                </div>
              </div>

              <div className="glass rounded-xl p-6">
                <h3 className="text-sm font-medium text-muted-foreground mb-4">Statystyki</h3>
                <div className="space-y-3">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Liczba faktur</span>
                    <span className="font-semibold">{supplier.invoiceCount}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Łączne wydatki</span>
                    <span className="font-semibold">{formatPrice(supplier.totalSpend)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Ostatnia faktura</span>
                    <span className="font-semibold">{formatDate(supplier.lastInvoiceDate)}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* ── Monthly spend chart ── */}
            <div className="glass rounded-xl p-6 mb-6">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h2 className="text-sm font-semibold text-foreground">Wydatki miesięczne</h2>
                  <p className="text-xs text-muted-foreground mt-0.5">Łączne wydatki u tego dostawcy — ostatnie 12 miesięcy</p>
                </div>
              </div>

              {monthlyLoading ? (
                <Skeleton className="h-48 w-full rounded-lg" />
              ) : chartData.length > 0 ? (
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={chartData} margin={{ top: 4, right: 4, left: -16, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                    <XAxis
                      dataKey="label"
                      tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)}
                    />
                    <Tooltip content={<ChartTooltip />} />
                    <Bar
                      dataKey="totalAmount"
                      fill="hsl(var(--primary))"
                      radius={[4, 4, 0, 0]}
                      maxBarSize={48}
                    />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">
                  Brak danych. Zaimportuj faktury od tego dostawcy.
                </div>
              )}
            </div>

            {/* ── Top 5 products ── */}
            <div className="glass rounded-xl mb-6">
              <div className="px-6 py-4 border-b border-border">
                <h2 className="font-semibold text-foreground">Top 5 produktów</h2>
                <p className="text-xs text-muted-foreground mt-0.5">Produkty najczęściej kupowane u tego dostawcy według wartości</p>
              </div>
              {topProductsLoading ? (
                <div className="p-6 space-y-3">
                  {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full rounded-lg" />)}
                </div>
              ) : topProducts && topProducts.length > 0 ? (
                <div className="divide-y divide-border">
                  {(topProducts as TopProduct[]).map((product, i) => {
                    const isClickable = product.productId != null;
                    return (
                      <div
                        key={i}
                        className={`px-4 md:px-6 py-3 flex items-center justify-between gap-3 transition-colors${isClickable ? " cursor-pointer hover:bg-secondary/40" : ""}`}
                        data-testid={`top-product-row-${i}`}
                        onClick={isClickable ? () => setSelectedProduct({ id: product.productId!, name: product.productName }) : undefined}
                      >
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          <div className="w-7 h-7 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                            <Package className="w-3.5 h-3.5" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-foreground truncate">{product.productName}</p>
                            <p className="text-xs text-muted-foreground">{product.purchaseCount} zakupów &middot; {product.unit}</p>
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-sm font-semibold text-foreground">{formatPrice(product.latestPrice)}/{product.unit}</p>
                          <p className="text-xs text-muted-foreground">Łącznie: {formatPrice(product.totalSpend)}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="p-12 text-center text-sm text-muted-foreground">
                  Brak produktów od tego dostawcy.
                </div>
              )}
            </div>

            {/* ── Invoices list ── */}
            <div className="glass rounded-xl">
              <div className="px-6 py-4 border-b border-border">
                <h2 className="font-semibold text-foreground">Historia faktur</h2>
              </div>
              {invoicesLoading ? (
                <div className="p-6 space-y-3">
                  {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12 w-full rounded-lg" />)}
                </div>
              ) : invoices && invoices.length > 0 ? (
                <div className="divide-y divide-border">
                  {invoices.map((invoice) => (
                    <div
                      key={invoice.id}
                      className="w-full px-6 py-4 flex items-center justify-between"
                      data-testid={`invoice-row-${invoice.id}`}
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
                          <FileText className="w-4 h-4" />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-foreground">{invoice.invoiceNumber}</p>
                          <p className="text-xs text-muted-foreground">{formatDate(invoice.invoiceDate)}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-semibold text-foreground">{formatPrice(invoice.totalAmount)}</p>
                        <p className="text-xs text-muted-foreground">{invoice.itemCount} pozycji</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-12 text-center text-sm text-muted-foreground">
                  Brak faktur od tego dostawcy.
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="text-center py-12 text-muted-foreground">Nie znaleziono dostawcy.</div>
        )}
      </div>
      {selectedProduct && (
        <PriceHistoryModal
          productId={selectedProduct.id}
          productName={selectedProduct.name}
          onClose={() => setSelectedProduct(null)}
          focusSupplierId={id}
          focusSupplierName={supplier?.name}
        />
      )}
    </Layout>
  );
}
